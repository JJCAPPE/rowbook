import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { MAX_PROOF_LONG_EDGE } from "@rowbook/shared";
import sharp from "sharp";

import { verifyStoredProof } from "../../apps/web/src/server/utils/proof-verification.ts";

const createJpeg = (width = 2, height = 2) =>
  sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 20, g: 40, b: 60 },
    },
  })
    .jpeg()
    .toBuffer();

test("accepts a complete stored image and returns canonical metadata", async () => {
  const jpeg = await createJpeg();
  assert.deepEqual(
    await verifyStoredProof({
      buffer: jpeg,
      declaredSize: jpeg.byteLength,
      declaredMimeType: "image/jpeg",
      storageSize: jpeg.byteLength,
    }),
    {
      verifiedSize: jpeg.byteLength,
      verifiedMimeType: "image/jpeg",
      contentSha256: createHash("sha256").update(jpeg).digest("hex"),
    },
  );
});

test("rejects missing bytes and declared type spoofing", async () => {
  const jpeg = await createJpeg();
  await assert.rejects(
    () =>
      verifyStoredProof({
        buffer: jpeg,
        declaredSize: jpeg.byteLength + 1,
        declaredMimeType: "image/jpeg",
        storageSize: jpeg.byteLength,
      }),
    /size does not match/,
  );
  await assert.rejects(
    () =>
      verifyStoredProof({
        buffer: jpeg,
        declaredSize: jpeg.byteLength,
        declaredMimeType: "image/png",
        storageSize: jpeg.byteLength,
      }),
    /type does not match/,
  );
});

test("rejects corrupt files even when their name and claimed size look valid", async () => {
  const corrupt = Buffer.from("not an image");
  await assert.rejects(
    () =>
      verifyStoredProof({
        buffer: corrupt,
        declaredSize: corrupt.byteLength,
        declaredMimeType: "image/jpeg",
        storageSize: corrupt.byteLength,
      }),
    /not a supported workout photo/,
  );
});

test("rejects a truncated file that still has valid image magic bytes", async () => {
  const jpeg = await createJpeg(20, 20);
  const truncated = jpeg.subarray(0, Math.floor(jpeg.byteLength / 2));
  await assert.rejects(
    () =>
      verifyStoredProof({
        buffer: truncated,
        declaredSize: truncated.byteLength,
        declaredMimeType: "image/jpeg",
        storageSize: truncated.byteLength,
      }),
    /corrupt or could not be decoded/,
  );
});

test("rejects decoded images beyond the server dimension cap", async () => {
  const oversized = await createJpeg(MAX_PROOF_LONG_EDGE + 1, 1);
  await assert.rejects(
    () =>
      verifyStoredProof({
        buffer: oversized,
        declaredSize: oversized.byteLength,
        declaredMimeType: "image/jpeg",
        storageSize: oversized.byteLength,
      }),
    /dimensions exceed/,
  );
});
