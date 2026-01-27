import { prisma } from "@/db/client";
import { ProofExtractionStatus } from "@rowbook/shared";
import { Prisma } from "@prisma/client";

export const createProofExtractionJob = (proofImageId: string) =>
  prisma.proofExtractionJob.create({
    data: {
      proofImageId,
      status: "NOT_CHECKED" as ProofExtractionStatus,
    },
  });

export const lockNextProofExtractionJob = async () => {
  const candidate = await prisma.proofExtractionJob.findFirst({
    where: {
      status: "NOT_CHECKED" as ProofExtractionStatus,
      lockedAt: null,
    },
    orderBy: { createdAt: "asc" },
  });

  if (!candidate) {
    return null;
  }

  const now = new Date();
  const { count } = await prisma.proofExtractionJob.updateMany({
    where: {
      id: candidate.id,
      status: "NOT_CHECKED" as ProofExtractionStatus,
      lockedAt: null,
    },
    data: {
      status: "PROCESSING" as ProofExtractionStatus,
      lockedAt: now,
      attempts: { increment: 1 },
    },
  });

  if (count === 0) {
    return null;
  }

  return prisma.proofExtractionJob.findUnique({ where: { id: candidate.id } });
};

export const updateProofExtractionJob = (id: string, data: Prisma.ProofExtractionJobUpdateInput) =>
  prisma.proofExtractionJob.update({
    where: { id },
    data,
  });

export const markProofExtractionJobFailed = (id: string, error: string) =>
  updateProofExtractionJob(id, {
    status: "FAILED" as ProofExtractionStatus,
    lastError: error.slice(0, 1000),
    lockedAt: null,
  });

export const markProofExtractionJobCompleted = (id: string) =>
  updateProofExtractionJob(id, {
    status: "COMPLETED" as ProofExtractionStatus,
    lastError: null,
    lockedAt: null,
  });
