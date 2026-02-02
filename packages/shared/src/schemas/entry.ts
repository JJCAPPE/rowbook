import { z } from "zod";

import { ActivityTypeSchema } from "../enums/activity-type";
import { EntryStatusSchema } from "../enums/entry-status";
import { ValidationStatusSchema } from "../enums/validation-status";
import {
  DistanceSchema,
  HeartRateSchema,
  MinutesSchema,
  OptionalNotesSchema,
} from "./common";
import { ProofOcrResultSchema } from "./proof";
import { parseDateStringAsNewYorkNoon } from "../utils/time";

/**
 * Custom date schema that handles date strings properly to avoid timezone issues.
 * When a date string like "2026-02-02" is passed, it parses it as noon in New York
 * timezone to avoid the date rolling back when interpreted as UTC midnight.
 */
const NewYorkDateSchema = z.preprocess((val) => {
  // If it's a Date, pass through
  if (val instanceof Date) {
    return val;
  }
  // If it's a date-only string (YYYY-MM-DD), parse it as noon in New York
  if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
    return parseDateStringAsNewYorkNoon(val);
  }
  // Otherwise try standard coercion
  return val;
}, z.coerce.date());

export const TrainingEntryInputSchema = z.object({
  activityType: ActivityTypeSchema,
  date: NewYorkDateSchema,
  minutes: MinutesSchema,
  distance: DistanceSchema,
  avgHr: HeartRateSchema.optional().nullable(),
  avgPace: z.number().positive().optional().nullable(),
  avgWatts: z.number().positive().optional().nullable(),
  notes: OptionalNotesSchema,
  proofImageIds: z.array(z.string()).min(1),
  proofOcr: ProofOcrResultSchema.optional().nullable(),
});
export type TrainingEntryInput = z.infer<typeof TrainingEntryInputSchema>;

export const TrainingEntryUpdateSchema = z.object({
  id: z.string(),
  activityType: ActivityTypeSchema.optional(),
  date: NewYorkDateSchema.optional(),
  minutes: MinutesSchema.optional(),
  distance: DistanceSchema.optional(),
  avgHr: HeartRateSchema.optional().nullable(),
  avgPace: z.number().positive().optional().nullable(),
  avgWatts: z.number().positive().optional().nullable(),
  notes: OptionalNotesSchema,
});
export type TrainingEntryUpdate = z.infer<typeof TrainingEntryUpdateSchema>;

export const TrainingEntrySchema = z.object({
  id: z.string(),
  athleteId: z.string(),
  activityType: ActivityTypeSchema,
  date: z.date(),
  minutes: MinutesSchema,
  distance: DistanceSchema,
  avgHr: HeartRateSchema.nullable(),
  avgPace: z.number().nullable(),
  avgWatts: z.number().nullable(),
  notes: z.string().max(1000).nullable(),
  // REMOVED: proofImageId
  validationStatus: ValidationStatusSchema,
  entryStatus: EntryStatusSchema,
  weekStartAt: z.date(),
  lockedAt: z.date().nullable(),
  rejectionNote: z.string().nullable().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type TrainingEntry = z.infer<typeof TrainingEntrySchema>;
