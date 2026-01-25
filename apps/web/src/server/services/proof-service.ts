import { ALLOWED_MIME_TYPES, MAX_UPLOAD_SIZE_BYTES, getWeekRange } from "@rowbook/shared";
import { createProofImage, getProofImageById, listExpiredProofImages, updateProofImage } from "@/server/repositories/proof-images";
import { createUploadUrl, createViewUrl, deleteFile } from "@/server/storage/proof-storage";

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
    expiresAt: new Date(Date.now() + VIEW_URL_TTL_SECONDS * 1000),
  };
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
