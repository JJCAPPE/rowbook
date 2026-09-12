import { z } from "zod";

import { ALLOWED_PROOF_MIME_TYPES, MAX_PROOF_IMAGE_SIZE_BYTES } from "../constants/limits";
import { ActivityTypeSchema } from "../enums/activity-type";
import { ProofExtractionStatusSchema } from "../enums/proof-extraction-status";
import { ValidationStatusSchema } from "../enums/validation-status";
import { DateOnlySchema, DistanceSchema, HeartRateSchema } from "./common";

export const ProofUploadRequestSchema = z.object({
  clientSubmissionId: z.string().uuid(),
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
  minutes: z.number().int().positive().max(24 * 60).optional().nullable(),
  durationSeconds: z.number().int().positive().max(24 * 60 * 60).optional().nullable(),
  elapsedSeconds: z.number().int().positive().max(24 * 60 * 60).optional().nullable(),
  distance: DistanceSchema.optional().nullable(),
  avgHr: HeartRateSchema.optional().nullable(),
  date: DateOnlySchema.optional().nullable(),
});
export type ProofExtractedFields = z.infer<typeof ProofExtractedFieldsSchema>;

export const EvidenceExtractionResultSchema = ProofExtractedFieldsSchema.extend({
  activityType: ActivityTypeSchema.nullable(),
  minutes: z.number().int().positive().max(24 * 60).nullable(),
  durationSeconds: z.number().int().positive().max(24 * 60 * 60).nullable(),
  elapsedSeconds: z.number().int().positive().max(24 * 60 * 60).nullable(),
  distance: DistanceSchema.nullable(),
  avgHr: HeartRateSchema.nullable(),
  date: DateOnlySchema.nullable(),
  confidence: z.number().min(0).max(1),
  isSingleWorkout: z.boolean(),
  reviewReason: z.string().trim().min(1).max(500).nullable(),
  sourceTypes: z.array(z.enum(["CONCEPT2", "GARMIN", "STRAVA", "OTHER"])).max(8),
});
export type EvidenceExtractionResult = z.infer<typeof EvidenceExtractionResultSchema>;

export const ProofOcrResultSchema = z.object({
  extractedFields: ProofExtractedFieldsSchema.optional().nullable(),
  error: z.string().max(1000).optional().nullable(),
});
export type ProofOcrResult = z.infer<typeof ProofOcrResultSchema>;

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
