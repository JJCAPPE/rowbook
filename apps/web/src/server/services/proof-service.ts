import { ALLOWED_MIME_TYPES, MAX_UPLOAD_SIZE_BYTES, getWeekRange } from "@rowbook/shared";
import { createProofImage, getProofImageById, listExpiredProofImages, updateProofImage } from "@/server/repositories/proof-images";
import { createUploadUrl, createViewUrl, deleteFile, downloadFile } from "@/server/storage/proof-storage";
import { extractProofWithGemini } from "@/server/services/proof-extraction-service";

const toBuffer = async (data: unknown) => {
  if (data instanceof Buffer) {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }

  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }

  if (data && typeof (data as Blob).arrayBuffer === "function") {
    const arrayBuffer = await (data as Blob).arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  if (data && typeof (data as ReadableStream).getReader === "function") {
    const arrayBuffer = await new Response(data as ReadableStream).arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  throw new Error("Unsupported proof image payload.");
};

const UPLOAD_URL_TTL_SECONDS = 15 * 60;
const VIEW_URL_TTL_SECONDS = 15 * 60;

const getDeleteAfter = (weekEndAt: Date) =>
  new Date(weekEndAt.getTime() + 7 * 24 * 60 * 60 * 1000);

const sanitizeFileName = (name: string) =>
  name.replace(/[^a-zA-Z0-9._-]/g, "_");

export const createProofUpload = async (
  athleteId: string,
  input: { fileName: string; fileSize: number; mimeType: string },
) => {
  if (input.fileSize > MAX_UPLOAD_SIZE_BYTES) {
    throw new Error("File exceeds maximum size.");
  }

  if (!ALLOWED_MIME_TYPES.includes(input.mimeType as (typeof ALLOWED_MIME_TYPES)[number])) {
    throw new Error("Unsupported file type.");
  }

  const { weekEndAt } = getWeekRange(new Date());
  const deleteAfter = getDeleteAfter(weekEndAt);
  const safeName = sanitizeFileName(input.fileName);
  const storagePath = `${athleteId}/${Date.now()}-${safeName}`;

  const proofImage = await createProofImage({
    athleteId,
    storagePath,
    deleteAfter,
    validationStatus: "NOT_CHECKED",
  });

  const upload = await createUploadUrl(storagePath);

  return {
    proofImageId: proofImage.id,
    uploadUrl: upload.signedUrl,
    storagePath,
    expiresAt: new Date(Date.now() + UPLOAD_URL_TTL_SECONDS * 1000),
  };
};

export const confirmProofUpload = async (athleteId: string, proofImageId: string) => {
  const proofImage = await getProofImageById(proofImageId);
  if (!proofImage || proofImage.athleteId !== athleteId) {
    throw new Error("Proof image not found.");
  }

  return updateProofImage(proofImageId, { uploadedAt: new Date() });
};

export const getProofViewUrl = async (
  athleteId: string,
  proofImageId: string,
  canViewAll: boolean,
) => {
  const proofImage = await getProofImageById(proofImageId);
  if (!proofImage) {
    throw new Error("Proof image not found.");
  }

  if (!canViewAll && proofImage.athleteId !== athleteId) {
    throw new Error("Access denied.");
  }

  const view = await createViewUrl(proofImage.storagePath, VIEW_URL_TTL_SECONDS);

  return {
    signedUrl: view.signedUrl,
  };
};

export const extractDataFromProof = async (athleteId: string, proofImageId: string) => {
  const proofImage = await getProofImageById(proofImageId);
  if (!proofImage) {
    throw new Error("Proof image not found.");
  }

  if (proofImage.athleteId !== athleteId) {
    throw new Error("Access denied.");
  }

  const file = await downloadFile(proofImage.storagePath);
  const buffer = await toBuffer(file);
  
  return extractProofWithGemini(buffer);
};

export const cleanupExpiredProofImages = async () => {
  const now = new Date();
  const expired = await listExpiredProofImages(now);

  for (const proof of expired) {
    await deleteFile(proof.storagePath);
    await updateProofImage(proof.id, { deletedAt: now });
  }

  return { deletedCount: expired.length };
};
