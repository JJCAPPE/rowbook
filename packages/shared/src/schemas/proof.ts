import { z } from "zod";

import { ALLOWED_PROOF_MIME_TYPES, MAX_PROOF_IMAGE_SIZE_BYTES } from "../constants/limits";
import { ActivityTypeSchema } from "../enums/activity-type";
import { ProofExtractionStatusSchema } from "../enums/proof-extraction-status";
import { ValidationStatusSchema } from "../enums/validation-status";
import {
  DistanceSchema,
  HeartRateSchema,
  IdSchema,
  IsoDateTimeSchema,
  MinutesSchema,
} from "./common";

export const ProofUploadRequestSchema = z.object({
  fileName: z.string().min(1),
  mimeType: z.enum(ALLOWED_PROOF_MIME_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_PROOF_IMAGE_SIZE_BYTES),
});
export type ProofUploadRequest = z.infer<typeof ProofUploadRequestSchema>;

export const ProofUploadResponseSchema = z.object({
  proofImageId: IdSchema,
  uploadUrl: z.string().url(),
  storagePath: z.string().min(1),
});
export type ProofUploadResponse = z.infer<typeof ProofUploadResponseSchema>;

export const ProofExtractedFieldsSchema = z.object({
  activityType: ActivityTypeSchema.optional().nullable(),
  minutes: MinutesSchema.optional().nullable(),
  distance: DistanceSchema.optional().nullable(),
  avgHr: HeartRateSchema.optional().nullable(),
  date: IsoDateTimeSchema.optional().nullable(),
});
export type ProofExtractedFields = z.infer<typeof ProofExtractedFieldsSchema>;

export const ProofImageSchema = z.object({
  id: IdSchema,
  athleteId: IdSchema,
  storagePath: z.string().min(1),
  uploadedAt: IsoDateTimeSchema,
  deleteAfter: IsoDateTimeSchema,
  extractedFields: ProofExtractedFieldsSchema.optional().nullable(),
  validationStatus: ValidationStatusSchema,
  reviewedBy: IdSchema.optional().nullable(),
});
export type ProofImage = z.infer<typeof ProofImageSchema>;

export const ProofExtractionJobSchema = z.object({
  proofImageId: IdSchema,
  status: ProofExtractionStatusSchema,
  attempts: z.number().int().nonnegative(),
  lockedAt: IsoDateTimeSchema.optional().nullable(),
  lastError: z.string().max(1000).optional().nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type ProofExtractionJob = z.infer<typeof ProofExtractionJobSchema>;
import { z } from "zod";
import { ValidationStatusSchema } from "../enums";

export const ProofUploadRequestSchema = z.object({
  fileName: z.string().min(1),
  fileSize: z.number().int().positive(),
  mimeType: z.string().min(1),
});

export const ProofUploadResponseSchema = z.object({
  proofImageId: z.string(),
  uploadUrl: z.string().url(),
  storagePath: z.string(),
  expiresAt: z.date(),
});

export const ProofConfirmSchema = z.object({
  proofImageId: z.string(),
});

export const ProofImageSchema = z.object({
  id: z.string(),
  athleteId: z.string(),
  storagePath: z.string(),
  uploadedAt: z.date().nullable(),
  deleteAfter: z.date(),
  validationStatus: ValidationStatusSchema,
  reviewedById: z.string().nullable(),
  deletedAt: z.date().nullable(),
});
