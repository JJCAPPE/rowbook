import { z } from "zod";

import { ALLOWED_PROOF_MIME_TYPES, MAX_PROOF_IMAGE_SIZE_BYTES } from "../constants/limits";
import { ActivityTypeSchema } from "../enums/activity-type";
import { ProofExtractionStatusSchema } from "../enums/proof-extraction-status";
import { ValidationStatusSchema } from "../enums/validation-status";
import { DistanceSchema, HeartRateSchema, IsoDateTimeSchema, MinutesSchema } from "./common";

export const ProofUploadRequestSchema = z.object({
  fileName: z.string().min(1),
  fileSize: z.number().int().positive().max(MAX_PROOF_IMAGE_SIZE_BYTES),
  mimeType: z.enum(ALLOWED_PROOF_MIME_TYPES),
});
export type ProofUploadRequest = z.infer<typeof ProofUploadRequestSchema>;

export const ProofUploadResponseSchema = z.object({
  proofImageId: z.string(),
  uploadUrl: z.string().url(),
  storagePath: z.string().min(1),
  expiresAt: z.date(),
});
export type ProofUploadResponse = z.infer<typeof ProofUploadResponseSchema>;

export const ProofConfirmSchema = z.object({
  proofImageId: z.string(),
});
export type ProofConfirm = z.infer<typeof ProofConfirmSchema>;

export const ProofExtractedFieldsSchema = z.object({
  activityType: ActivityTypeSchema.optional().nullable(),
  minutes: MinutesSchema.optional().nullable(),
  distance: DistanceSchema.optional().nullable(),
  avgHr: HeartRateSchema.optional().nullable(),
  date: IsoDateTimeSchema.optional().nullable(),
});
export type ProofExtractedFields = z.infer<typeof ProofExtractedFieldsSchema>;

export const ProofImageSchema = z.object({
  id: z.string(),
  athleteId: z.string(),
  storagePath: z.string().min(1),
  uploadedAt: z.date().nullable(),
  deleteAfter: z.date(),
  deletedAt: z.date().nullable(),
  extractedFields: ProofExtractedFieldsSchema.optional().nullable(),
  validationStatus: ValidationStatusSchema,
  reviewedById: z.string().nullable(),
});
export type ProofImage = z.infer<typeof ProofImageSchema>;

export const ProofExtractionJobSchema = z.object({
  proofImageId: z.string(),
  status: ProofExtractionStatusSchema,
  attempts: z.number().int().nonnegative(),
  lockedAt: z.date().nullable(),
  lastError: z.string().max(1000).optional().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type ProofExtractionJob = z.infer<typeof ProofExtractionJobSchema>;
