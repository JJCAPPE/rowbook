import { createHash } from "node:crypto";
import {
  MAX_PROOF_LONG_EDGE,
  MAX_PROOF_PIXELS,
  MAX_UPLOAD_SIZE_BYTES,
} from "@rowbook/shared";
import sharp from "sharp";
import { detectImageMimeType } from "@/server/services/proof-extraction-service";

const MIME_BY_SHARP_FORMAT = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const;

export const verifyStoredProof = async (input: {
  buffer: Buffer;
  declaredSize: number | null;
  declaredMimeType: string | null;
  storageSize?: number;
}) => {
  const verifiedSize = input.buffer.byteLength;
  const verifiedMimeType = detectImageMimeType(input.buffer);

  if (verifiedSize > MAX_UPLOAD_SIZE_BYTES) {
    throw new Error("Uploaded proof exceeds the maximum size.");
  }
  if (input.declaredSize !== verifiedSize) {
    throw new Error("Uploaded proof size does not match the selected file.");
  }
  if (input.storageSize !== undefined && input.storageSize !== verifiedSize) {
    throw new Error("Uploaded proof is incomplete.");
  }
  if (input.declaredMimeType !== verifiedMimeType) {
    throw new Error("Uploaded proof type does not match the selected file.");
  }

  let decoded: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    const image = sharp(input.buffer, {
      failOn: "warning",
      limitInputPixels: MAX_PROOF_PIXELS,
    });
    decoded = await image.metadata();
    await image.stats();
  } catch {
    throw new Error("Uploaded proof is corrupt or could not be decoded.");
  }
  const decodedMimeType = decoded.format
    ? MIME_BY_SHARP_FORMAT[decoded.format as keyof typeof MIME_BY_SHARP_FORMAT]
    : undefined;
  if (!decoded.width || !decoded.height || decodedMimeType !== verifiedMimeType) {
    throw new Error("Uploaded proof is corrupt or could not be decoded.");
  }
  if (
    decoded.width > MAX_PROOF_LONG_EDGE ||
    decoded.height > MAX_PROOF_LONG_EDGE ||
    decoded.width * decoded.height > MAX_PROOF_PIXELS
  ) {
    throw new Error("Uploaded proof dimensions exceed the maximum size.");
  }

  return {
    verifiedSize,
    verifiedMimeType,
    contentSha256: createHash("sha256").update(input.buffer).digest("hex"),
  };
};
