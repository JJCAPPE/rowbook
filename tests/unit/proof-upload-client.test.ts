import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNormalizedFileName,
  detectProofSourceKind,
  formatUploadBytes,
  getConstrainedDimensions,
  MAX_PROOF_LONG_EDGE,
  PROOF_UPLOAD_TIMEOUT_MS,
  ProofImageProcessingError,
  ProofUploadTransferError,
  startProofUpload,
} from "../../apps/web/src/components/forms/proof-upload-client.ts";

type TestListener = (event: Record<string, unknown>) => void;

class FakeEventTarget {
  private readonly listeners = new Map<string, TestListener[]>();

  addEventListener(type: string, listener: TestListener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  emit(type: string, event: Record<string, unknown> = {}) {
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }
}

class FakeXMLHttpRequest extends FakeEventTarget {
  static latest: FakeXMLHttpRequest | null = null;

  readonly upload = new FakeEventTarget();
  readonly headers = new Map<string, string>();
  status = 0;
  timeout = 0;
  method = "";
  url = "";
  sentFile: File | null = null;

  constructor() {
    super();
    FakeXMLHttpRequest.latest = this;
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string) {
    this.headers.set(name, value);
  }

  send(file: File) {
    this.sentFile = file;
  }

  abort() {
    this.emit("abort");
  }
}

test("detects camera formats when the browser omits MIME metadata", async () => {
  const jpeg = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "", {
    type: "",
  });
  const heicHeader = new Uint8Array(16);
  heicHeader.set(new TextEncoder().encode("ftyp"), 4);
  heicHeader.set(new TextEncoder().encode("heic"), 8);
  const heic = new File([heicHeader], "", { type: "" });

  assert.equal(await detectProofSourceKind(jpeg), "jpeg");
  assert.equal(await detectProofSourceKind(heic), "heic");
});

test("falls back to a case-insensitive extension when MIME is empty", async () => {
  const heif = new File([new Uint8Array([1, 2, 3])], "PM5-PHOTO.HEIF", {
    type: "",
  });
  const webp = new File([new Uint8Array([1, 2, 3])], "garmin.WEBP", {
    type: "",
  });

  assert.equal(await detectProofSourceKind(heif), "heic");
  assert.equal(await detectProofSourceKind(webp), "webp");
});

test("rejects an unrecognized file instead of casting its MIME type", async () => {
  const unknown = new File([new TextEncoder().encode("not an image")], "proof", {
    type: "",
  });

  await assert.rejects(
    () => detectProofSourceKind(unknown),
    (error: unknown) =>
      error instanceof ProofImageProcessingError &&
      error.message.includes("JPEG, PNG, WebP, HEIC, or HEIF"),
  );
});

test("constrains landscape and portrait photos without upscaling", () => {
  assert.deepEqual(getConstrainedDimensions(4000, 3000), {
    width: MAX_PROOF_LONG_EDGE,
    height: 1650,
  });
  assert.deepEqual(getConstrainedDimensions(3000, 4000), {
    width: 1650,
    height: MAX_PROOF_LONG_EDGE,
  });
  assert.deepEqual(getConstrainedDimensions(1200, 800), {
    width: 1200,
    height: 800,
  });
});

test("normalizes file names and byte labels for upload", () => {
  assert.equal(buildNormalizedFileName("IMG_0042.HEIC"), "IMG_0042.jpg");
  assert.equal(buildNormalizedFileName(""), "workout-proof.jpg");
  assert.equal(formatUploadBytes(512), "512 B");
  assert.equal(formatUploadBytes(2048), "2 KB");
  assert.equal(formatUploadBytes(1.5 * 1024 * 1024), "1.5 MB");
});

test("reports real XHR bytes and exposes timeout and cancel behavior", async () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "XMLHttpRequest",
  );
  Object.defineProperty(globalThis, "XMLHttpRequest", {
    configurable: true,
    writable: true,
    value: FakeXMLHttpRequest,
  });

  try {
    const file = new File([new Uint8Array(100)], "proof.jpg", {
      type: "image/jpeg",
    });
    const progress: Array<{ loaded: number; total: number; percent: number }> = [];
    const successful = startProofUpload("https://uploads.example/proof", file, (value) =>
      progress.push(value),
    );
    const firstRequest = FakeXMLHttpRequest.latest;
    assert.ok(firstRequest);
    assert.equal(firstRequest.method, "PUT");
    assert.equal(firstRequest.timeout, PROOF_UPLOAD_TIMEOUT_MS);
    assert.equal(firstRequest.headers.get("Content-Type"), "image/jpeg");
    firstRequest.upload.emit("progress", {
      lengthComputable: true,
      loaded: 25,
      total: 100,
    });
    firstRequest.status = 200;
    firstRequest.emit("load");
    await successful.promise;
    assert.deepEqual(progress, [
      { loaded: 0, total: 100, percent: 0 },
      { loaded: 25, total: 100, percent: 25 },
      { loaded: 100, total: 100, percent: 100 },
    ]);

    const timedOut = startProofUpload("https://uploads.example/timeout", file, () => {});
    FakeXMLHttpRequest.latest?.emit("timeout");
    await assert.rejects(
      timedOut.promise,
      (error: unknown) =>
        error instanceof ProofUploadTransferError && error.message.includes("60 seconds"),
    );

    const cancelled = startProofUpload("https://uploads.example/cancel", file, () => {});
    cancelled.cancel();
    await assert.rejects(
      cancelled.promise,
      (error: unknown) => error instanceof DOMException && error.name === "AbortError",
    );
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(globalThis, "XMLHttpRequest", originalDescriptor);
    } else {
      Reflect.deleteProperty(globalThis, "XMLHttpRequest");
    }
  }
});
