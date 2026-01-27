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

export const TrainingEntryInputSchema = z.object({
  activityType: ActivityTypeSchema,
  date: z.coerce.date(),
  minutes: MinutesSchema,
  distance: DistanceSchema,
  avgHr: HeartRateSchema.optional().nullable(),
  avgPace: z.number().positive().optional().nullable(),
  avgWatts: z.number().positive().optional().nullable(),
  notes: OptionalNotesSchema,
  proofImageId: z.string(),
});
export type TrainingEntryInput = z.infer<typeof TrainingEntryInputSchema>;

export const TrainingEntryUpdateSchema = z.object({
  id: z.string(),
  activityType: ActivityTypeSchema.optional(),
  date: z.coerce.date().optional(),
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
  proofImageId: z.string(),
  validationStatus: ValidationStatusSchema,
  entryStatus: EntryStatusSchema,
  weekStartAt: z.date(),
  lockedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type TrainingEntry = z.infer<typeof TrainingEntrySchema>;

