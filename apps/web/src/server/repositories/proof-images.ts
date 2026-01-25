import { prisma } from "@/db/client";
import { ValidationStatus } from "@rowbook/shared";

export const createProofImage = (data: {
  athleteId: string;
  storagePath: string;
  deleteAfter: Date;
  validationStatus: ValidationStatus;
}) =>
  prisma.proofImage.create({
    data,
  });

export const updateProofImage = (id: string, data: Partial<{
  uploadedAt: Date | null;
  deleteAfter: Date;
  deletedAt: Date | null;
  extractedFields: Record<string, unknown> | null;
  validationStatus: ValidationStatus;
  reviewedById: string | null;
}>) =>
  prisma.proofImage.update({
    where: { id },
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
