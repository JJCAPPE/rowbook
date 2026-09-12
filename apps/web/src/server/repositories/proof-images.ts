import { prisma } from "@/db/client";
import { PENDING_PROOF_STATUSES, ValidationStatus } from "@rowbook/shared";
import { Prisma } from "@prisma/client";

export const createProofImage = (data: {
  id: string;
  athleteId: string;
  storagePath: string;
  clientSubmissionId: string;
  originalFileName: string;
  declaredSize: number;
  declaredMimeType: string;
  deleteAfter: Date;
  validationStatus: ValidationStatus;
}) =>
  prisma.proofImage.create({
    data,
  });

export const updateProofImage = (id: string, data: Prisma.ProofImageUncheckedUpdateInput) =>
  prisma.proofImage.update({
    where: { id },
    data,
  });

export const updateProofImageIfPending = (
  id: string,
  data: Prisma.ProofImageUncheckedUpdateInput,
) =>
  prisma.proofImage.updateMany({
    where: {
      id,
      validationStatus: { in: Array.from(PENDING_PROOF_STATUSES) },
    },
    data,
  });

export const getProofImageById = (id: string) =>
  prisma.proofImage.findUnique({
    where: { id },
  });

export const confirmProofImage = async (
  id: string,
  data: {
    uploadedAt: Date;
    verifiedSize: number;
    verifiedMimeType: string;
    contentSha256: string;
  },
) => {
  await prisma.proofImage.updateMany({
    where: { id, uploadedAt: null, deletedAt: null },
    data,
  });

  return getProofImageById(id);
};

export const listExpiredProofImages = (now: Date, take: number) =>
  prisma.proofImage.findMany({
    where: {
      deleteAfter: { lte: now },
      deletedAt: null,
    },
    select: { id: true },
    orderBy: [{ deleteAfter: "asc" }, { id: "asc" }],
    take,
  });

export const lockExpiredProofImageForCleanup = async (
  tx: Prisma.TransactionClient,
  id: string,
  now: Date,
) => {
  const locked = await tx.$queryRaw<Array<{ id: string; storagePath: string }>>`
    SELECT "id", "storagePath"
    FROM "ProofImage"
    WHERE "id" = ${id}
      AND "deleteAfter" <= (${now}::timestamptz AT TIME ZONE 'UTC')
      AND "deletedAt" IS NULL
    FOR UPDATE
  `;
  return locked[0] ?? null;
};

export const markExpiredProofImageDeleted = (
  tx: Prisma.TransactionClient,
  id: string,
  now: Date,
) =>
  tx.proofImage.updateMany({
    where: {
      id,
      deleteAfter: { lte: now },
      deletedAt: null,
    },
    data: { deletedAt: now },
  });

export const updateProofImagesByEntryId = (entryId: string, data: Prisma.ProofImageUncheckedUpdateInput) =>
  prisma.proofImage.updateMany({
    where: { trainingEntryId: entryId },
    data,
  });
