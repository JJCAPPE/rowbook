import { prisma } from "@/db/client";
import { ProofExtractionStatus } from "@rowbook/shared";

export const createProofExtractionJob = (proofImageId: string) =>
  prisma.proofExtractionJob.create({
    data: {
      proofImageId,
      status: "NOT_CHECKED" as ProofExtractionStatus,
    },
  });
