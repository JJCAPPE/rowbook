import { prisma } from "@/db/client";
import { PENDING_PROOF_STATUSES, ValidationStatus } from "@rowbook/shared";
import { Prisma } from "@prisma/client";

export const createProofImage = (data: {
  athleteId: string;
  storagePath: string;
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

export const listExpiredProofImages = (now: Date) =>
  prisma.proofImage.findMany({
    where: {
      deleteAfter: { lte: now },
      deletedAt: null,
    },
  });
