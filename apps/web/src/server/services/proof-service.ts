import { randomUUID } from "node:crypto";
import {
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_SIZE_BYTES,
  getProofRetentionDeleteAfter,
  getWeekRange,
  nowInZone,
} from "@rowbook/shared";
import {
  confirmProofImage,
  createProofImage,
  getProofImageById,
  listExpiredProofImages,
  lockExpiredProofImageForCleanup,
  markExpiredProofImageDeleted,
} from "@/server/repositories/proof-images";
import {
  createUploadUrl,
  createViewUrl,
  deleteFile,
  downloadFile,
  getFileInfo,
} from "@/server/storage/proof-storage";
import { prisma } from "@/db/client";
import { verifyStoredProof } from "@/server/utils/proof-verification";

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
export const PROOF_CLEANUP_BATCH_SIZE = 500;
const PROOF_CLEANUP_TRANSACTION_TIMEOUT_MS = 30_000;

const sanitizeFileName = (name: string) =>
  name.replace(/[^a-zA-Z0-9._-]/g, "_");

export const createProofUpload = async (
  athleteId: string,
  input: {
    clientSubmissionId: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
  },
) => {
  if (input.fileSize > MAX_UPLOAD_SIZE_BYTES) {
    throw new Error("File exceeds maximum size.");
  }

  if (!ALLOWED_MIME_TYPES.includes(input.mimeType as (typeof ALLOWED_MIME_TYPES)[number])) {
    throw new Error("Unsupported file type.");
  }

  const { weekEndAt } = getWeekRange(nowInZone());
  const deleteAfter = getProofRetentionDeleteAfter(weekEndAt);
  const safeName = sanitizeFileName(input.fileName);
  const proofImageId = randomUUID();
  const storagePath = `${athleteId}/${proofImageId}/${safeName}`;

  const proofImage = await createProofImage({
    id: proofImageId,
    athleteId,
    storagePath,
    clientSubmissionId: input.clientSubmissionId,
    originalFileName: input.fileName,
    declaredSize: input.fileSize,
    declaredMimeType: input.mimeType,
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
  if (!proofImage || proofImage.athleteId !== athleteId || proofImage.deletedAt) {
    throw new Error("Proof image not found.");
  }

  if (
    proofImage.uploadedAt &&
    proofImage.verifiedSize &&
    proofImage.verifiedMimeType &&
    proofImage.contentSha256
  ) {
    return proofImage;
  }

  const [fileInfo, file] = await Promise.all([
    getFileInfo(proofImage.storagePath),
    downloadFile(proofImage.storagePath),
  ]);
  const buffer = await toBuffer(file);
  const verified = await verifyStoredProof({
    buffer,
    declaredSize: proofImage.declaredSize,
    declaredMimeType: proofImage.declaredMimeType,
    storageSize: fileInfo.size,
  });

  const updatedTarget = await confirmProofImage(proofImageId, {
    uploadedAt: nowInZone().toJSDate(),
    ...verified,
  });
  if (!updatedTarget?.uploadedAt) {
    throw new Error("Proof upload could not be confirmed.");
  }

  return updatedTarget;
};

export const getProofViewUrl = async (
  athleteId: string,
  proofImageId: string,
  canViewAll: boolean,
) => {
  const proofImage = await getProofImageById(proofImageId);
  if (!proofImage || proofImage.deletedAt || !proofImage.uploadedAt) {
    throw new Error("Proof image not found.");
  }

  if (!canViewAll && proofImage.athleteId !== athleteId) {
    throw new Error("Access denied.");
  }

  if (canViewAll && proofImage.athleteId !== athleteId) {
    const authorized = await prisma.proofImage.count({
      where: {
        id: proofImageId,
        athlete: {
          athleteProfile: {
            team: { coaches: { some: { coachId: athleteId } } },
          },
        },
      },
    });
    if (!authorized) {
      throw new Error("Access denied.");
    }
  }

  const view = await createViewUrl(proofImage.storagePath, VIEW_URL_TTL_SECONDS);

  return {
    signedUrl: view.signedUrl,
  };
};

type ProofCleanupOptions = {
  now?: Date;
  maxCandidates?: number;
  removeStorageObject?: (storagePath: string) => Promise<void>;
};

export const cleanupExpiredProofImageCandidate = async (
  proofImageId: string,
  now: Date,
  removeStorageObject: (storagePath: string) => Promise<void> = deleteFile,
) =>
  prisma.$transaction(
    async (tx) => {
      const proof = await lockExpiredProofImageForCleanup(tx, proofImageId, now);
      if (!proof) return false;

      await removeStorageObject(proof.storagePath);
      const marked = await markExpiredProofImageDeleted(tx, proof.id, now);
      if (marked.count !== 1) {
        throw new Error("Expired proof changed while cleanup was in progress.");
      }
      return true;
    },
    { timeout: PROOF_CLEANUP_TRANSACTION_TIMEOUT_MS },
  );

export const cleanupExpiredProofImages = async (
  options: ProofCleanupOptions = {},
) => {
  const now = options.now ?? nowInZone().toJSDate();
  const requestedCandidates = options.maxCandidates ?? PROOF_CLEANUP_BATCH_SIZE;
  const maxCandidates = Math.min(
    PROOF_CLEANUP_BATCH_SIZE,
    Math.max(1, Math.trunc(requestedCandidates)),
  );
  const expired = await listExpiredProofImages(now, maxCandidates);
  const removeStorageObject = options.removeStorageObject ?? deleteFile;
  let deletedCount = 0;
  let failedCount = 0;

  for (const proof of expired) {
    try {
      if (
        await cleanupExpiredProofImageCandidate(
          proof.id,
          now,
          removeStorageObject,
        )
      ) {
        deletedCount += 1;
      }
    } catch (error) {
      failedCount += 1;
      console.error("Expired proof cleanup failed", {
        proofImageId: proof.id,
        error: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }

  return { deletedCount, failedCount };
};
