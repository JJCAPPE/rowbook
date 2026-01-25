import { z } from "zod";

export const ProofExtractionStatusValues = [
  "NOT_CHECKED",
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
] as const;
export const ProofExtractionStatusSchema = z.enum(ProofExtractionStatusValues);
export type ProofExtractionStatus = z.infer<typeof ProofExtractionStatusSchema>;
