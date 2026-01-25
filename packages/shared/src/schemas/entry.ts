import { z } from "zod";

import { ActivityTypeSchema } from "../enums/activity-type";
import { EntryStatusSchema } from "../enums/entry-status";
import { ValidationStatusSchema } from "../enums/validation-status";
import {
  DistanceSchema,
  HeartRateSchema,
  IdSchema,
  IsoDateTimeSchema,
  MinutesSchema,
  OptionalNotesSchema,
} from "./common";

export const TrainingEntryInputSchema = z.object({
  activityType: ActivityTypeSchema,
  date: IsoDateTimeSchema,
  minutes: MinutesSchema,
  distance: DistanceSchema,
  avgHr: HeartRateSchema.optional().nullable(),
  notes: OptionalNotesSchema,
  proofImageId: IdSchema,
});
export type TrainingEntryInput = z.infer<typeof TrainingEntryInputSchema>;

export const TrainingEntrySchema = TrainingEntryInputSchema.extend({
  id: IdSchema,
  athleteId: IdSchema,
  weekStartAt: IsoDateTimeSchema,
  lockedAt: IsoDateTimeSchema.optional().nullable(),
  validationStatus: ValidationStatusSchema,
  entryStatus: EntryStatusSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type TrainingEntry = z.infer<typeof TrainingEntrySchema>;

export const TrainingEntryUpdateSchema = TrainingEntryInputSchema.partial().extend({
  id: IdSchema,
});
export type TrainingEntryUpdate = z.infer<typeof TrainingEntryUpdateSchema>;
import { z } from "zod";
import { ActivityTypeSchema, ValidationStatusSchema, EntryStatusSchema } from "../enums";

export const TrainingEntryInputSchema = z.object({
  activityType: ActivityTypeSchema,
  date: z.coerce.date(),
  minutes: z.number().int().positive(),
  distance: z.number().nonnegative(),
  avgHr: z.number().int().positive().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  proofImageId: z.string(),
});

export const TrainingEntryUpdateSchema = z.object({
  id: z.string(),
  activityType: ActivityTypeSchema.optional(),
  date: z.coerce.date().optional(),
  minutes: z.number().int().positive().optional(),
  distance: z.number().nonnegative().optional(),
  avgHr: z.number().int().positive().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const TrainingEntrySchema = z.object({
  id: z.string(),
  athleteId: z.string(),
  activityType: ActivityTypeSchema,
  date: z.date(),
  minutes: z.number().int(),
  distance: z.number(),
  avgHr: z.number().int().nullable(),
  notes: z.string().nullable(),
  proofImageId: z.string(),
  validationStatus: ValidationStatusSchema,
  entryStatus: EntryStatusSchema,
  weekStartAt: z.date(),
  lockedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
