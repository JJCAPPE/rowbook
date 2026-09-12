import {
  MAX_PROOF_FILES,
  MAX_PROOF_IMAGE_SIZE_BYTES,
  MAX_PROOF_LONG_EDGE,
} from "@rowbook/shared";

export { MAX_PROOF_FILES, MAX_PROOF_LONG_EDGE };
export const MAX_PROOF_BYTES = MAX_PROOF_IMAGE_SIZE_BYTES;
export const PROOF_UPLOAD_TIMEOUT_MS = 60_000;

export type ProofSourceKind = "jpeg" | "png" | "webp" | "heic";
export type ProofUploadStatus =
  | "queued"
  | "preparing"
  | "uploading"
  | "confirming"
  | "ready"
  | "error";

export type UploadByteProgress = {
  loaded: number;
  total: number;
  percent: number;
};

export type ProofUploadControl = {
  promise: Promise<void>;
  cancel: () => void;
};

export class ProofImageProcessingError extends Error {
  readonly retryable = false;

  constructor(message: string) {
    super(message);
    this.name = "ProofImageProcessingError";
  }
}

export class ProofUploadTransferError extends Error {
  readonly retryable = true;

  constructor(message: string) {
    super(message);
    this.name = "ProofUploadTransferError";
  }
}

const sourceKindByMime: Record<string, ProofSourceKind> = {
  "image/jpeg": "jpeg",
  "image/jpg": "jpeg",
  "image/png": "png",
  "image/x-png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heic",
  "image/heic-sequence": "heic",
  "image/heif-sequence": "heic",
};

const sourceKindByExtension: Record<string, ProofSourceKind> = {
  jpg: "jpeg",
  jpeg: "jpeg",
  png: "png",
  webp: "webp",
  heic: "heic",
  heif: "heic",
};

const isJpegHeader = (bytes: Uint8Array) =>
  bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

const isPngHeader = (bytes: Uint8Array) =>
  bytes[0] === 0x89 &&
  bytes[1] === 0x50 &&
  bytes[2] === 0x4e &&
  bytes[3] === 0x47;

const isWebpHeader = (bytes: Uint8Array) =>
  String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
  String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";

const isHeicHeader = (bytes: Uint8Array) => {
  if (String.fromCharCode(...bytes.slice(4, 8)) !== "ftyp") {
    return false;
  }

  const brand = String.fromCharCode(...bytes.slice(8, 12)).toLowerCase();
  return ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(
    brand,
  );
};

export const detectProofSourceKind = async (file: File): Promise<ProofSourceKind> => {
  const declaredMime = file.type.toLowerCase().split(";", 1)[0]?.trim() ?? "";
  const declaredKind = sourceKindByMime[declaredMime];
  if (declaredKind) {
    return declaredKind;
  }

  const extension = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  const extensionKind = sourceKindByExtension[extension];
  if (extensionKind) {
    return extensionKind;
  }

  const bytes = new Uint8Array(await file.slice(0, 24).arrayBuffer());
  if (isJpegHeader(bytes)) return "jpeg";
  if (isPngHeader(bytes)) return "png";
  if (isWebpHeader(bytes)) return "webp";
  if (isHeicHeader(bytes)) return "heic";

  throw new ProofImageProcessingError(
    "This file is not a supported photo. Choose a JPEG, PNG, WebP, HEIC, or HEIF image.",
  );
};

export const getConstrainedDimensions = (
  width: number,
  height: number,
  maxLongEdge = MAX_PROOF_LONG_EDGE,
) => {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new ProofImageProcessingError("This photo could not be read. Choose another image.");
  }

  const scale = Math.min(1, maxLongEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

export const buildNormalizedFileName = (name: string) => {
  const leafName = name.split(/[\\/]/).pop()?.trim() || "workout-proof";
  const stem = leafName.replace(/\.[^.]+$/, "").trim() || "workout-proof";
  return `${stem}.jpg`;
};

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw new DOMException("Photo preparation cancelled.", "AbortError");
  }
};

const isAbortException = (error: unknown) =>
  error instanceof DOMException && error.name === "AbortError";

const loadBrowserImage = (blob: Blob, signal?: AbortSignal) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    throwIfAborted(signal);
    const objectUrl = URL.createObjectURL(blob);
    const image = new window.Image();
    let settled = false;

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      signal?.removeEventListener("abort", handleAbort);
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const handleAbort = () =>
      finish(() => reject(new DOMException("Photo preparation cancelled.", "AbortError")));

    signal?.addEventListener("abort", handleAbort, { once: true });
    image.decoding = "async";
    image.onload = () => finish(() => resolve(image));
    image.onerror = () =>
      finish(() =>
        reject(
          new ProofImageProcessingError(
            "This photo could not be decoded. Choose the original image or take it again.",
          ),
        ),
      );
    image.src = objectUrl;
  });

const canvasToJpeg = (canvas: HTMLCanvasElement, quality: number, signal?: AbortSignal) =>
  new Promise<Blob>((resolve, reject) => {
    throwIfAborted(signal);
    canvas.toBlob(
      (blob) => {
        if (signal?.aborted) {
          reject(new DOMException("Photo preparation cancelled.", "AbortError"));
          return;
        }
        if (!blob) {
          reject(new ProofImageProcessingError("This photo could not be prepared."));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      quality,
    );
  });

export const normalizeProofImage = async (file: File, signal?: AbortSignal) => {
  if (file.size <= 0) {
    throw new ProofImageProcessingError("This photo is empty. Choose another image.");
  }

  throwIfAborted(signal);
  const sourceKind = await detectProofSourceKind(file);
  let decodableBlob: Blob = file;

  if (sourceKind === "heic") {
    try {
      const { default: heic2any } = await import("heic2any");
      throwIfAborted(signal);
      const converted = await heic2any({
        blob: file,
        toType: "image/jpeg",
        quality: 0.92,
      });
      decodableBlob = Array.isArray(converted) ? converted[0] : converted;
    } catch (primaryError) {
      if (isAbortException(primaryError)) throw primaryError;

      try {
        const { heicTo } = await import("heic-to");
        throwIfAborted(signal);
        decodableBlob = await heicTo({
          blob: file,
          type: "image/jpeg",
          quality: 0.92,
        });
      } catch (fallbackError) {
        if (isAbortException(fallbackError)) throw fallbackError;
        throw new ProofImageProcessingError(
          "This HEIC photo could not be converted. Export it as JPEG and try again.",
        );
      }
    }
    if (!decodableBlob) {
      throw new ProofImageProcessingError(
        "This HEIC photo could not be converted. Export it as JPEG and try again.",
      );
    }
  }

  throwIfAborted(signal);
  const image = await loadBrowserImage(decodableBlob, signal);
  const baseDimensions = getConstrainedDimensions(image.naturalWidth, image.naturalHeight);
  const scaleSteps = [1, 0.85, 0.7];
  const qualitySteps = [0.9, 0.82, 0.72, 0.62];

  for (const scale of scaleSteps) {
    throwIfAborted(signal);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(baseDimensions.width * scale));
    canvas.height = Math.max(1, Math.round(baseDimensions.height * scale));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      throw new ProofImageProcessingError("This browser could not prepare the photo.");
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    for (const quality of qualitySteps) {
      const blob = await canvasToJpeg(canvas, quality, signal);
      if (blob.size <= MAX_PROOF_BYTES) {
        return {
          file: new File([blob], buildNormalizedFileName(file.name), {
            type: "image/jpeg",
            lastModified: file.lastModified,
          }),
          mimeType: "image/jpeg" as const,
          width: canvas.width,
          height: canvas.height,
        };
      }
    }
  }

  throw new ProofImageProcessingError(
    "This photo is still larger than 10 MB after resizing. Crop it and try again.",
  );
};

export const startProofUpload = (
  url: string,
  file: File,
  onProgress: (progress: UploadByteProgress) => void,
): ProofUploadControl => {
  const request = new XMLHttpRequest();
  let settled = false;

  const promise = new Promise<void>((resolve, reject) => {
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      callback();
    };

    request.open("PUT", url);
    request.timeout = PROOF_UPLOAD_TIMEOUT_MS;
    request.setRequestHeader("Content-Type", file.type);
    onProgress({ loaded: 0, total: file.size, percent: 0 });

    request.upload.addEventListener("progress", (event) => {
      const total = event.lengthComputable && event.total > 0 ? event.total : file.size;
      const percent = total > 0 ? Math.round((event.loaded / total) * 100) : 0;
      onProgress({
        loaded: event.loaded,
        total,
        percent: Math.min(Math.max(percent, 0), 100),
      });
    });

    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress({ loaded: file.size, total: file.size, percent: 100 });
        finish(resolve);
        return;
      }
      finish(() =>
        reject(new ProofUploadTransferError("Upload failed. Retry this photo.")),
      );
    });
    request.addEventListener("error", () =>
      finish(() =>
        reject(
          new ProofUploadTransferError(
            "The photo could not be uploaded. Check your connection and retry it.",
          ),
        ),
      ),
    );
    request.addEventListener("timeout", () =>
      finish(() =>
        reject(new ProofUploadTransferError("Upload timed out after 60 seconds. Retry it.")),
      ),
    );
    request.addEventListener("abort", () =>
      finish(() => reject(new DOMException("Upload cancelled.", "AbortError"))),
    );

    request.send(file);
  });

  return {
    promise,
    cancel: () => {
      if (!settled) request.abort();
    },
  };
};

export const formatUploadBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
