import { z } from "zod";

import { ActivityTypeSchema } from "../enums/activity-type";
import { WeeklyStatusSchema } from "../enums/weekly-status";
import { IdSchema, IsoDateTimeSchema, MinutesSchema } from "./common";

export const WeekRangeSchema = z.object({
  weekStartAt: IsoDateTimeSchema,
  weekEndAt: IsoDateTimeSchema,
});
export type WeekRange = z.infer<typeof WeekRangeSchema>;

export const WeeklyRequirementSchema = WeekRangeSchema.extend({
  teamId: IdSchema,
  requiredMinutes: MinutesSchema,
});
export type WeeklyRequirement = z.infer<typeof WeeklyRequirementSchema>;

export const ExemptionSchema = z.object({
  athleteId: IdSchema,
  weekStartAt: IsoDateTimeSchema,
  reason: z.string().min(1).max(500),
  createdBy: IdSchema,
  createdAt: IsoDateTimeSchema,
});
export type Exemption = z.infer<typeof ExemptionSchema>;

export const WeeklyAggregateSchema = WeekRangeSchema.extend({
  athleteId: IdSchema,
  totalMinutes: z.number().int().nonnegative(),
  activityTypes: z.array(ActivityTypeSchema),
  hasHrData: z.boolean(),
  status: WeeklyStatusSchema,
});
export type WeeklyAggregate = z.infer<typeof WeeklyAggregateSchema>;
import { z } from "zod";
import { ActivityTypeSchema, WeeklyStatusSchema } from "../enums";

export const WeeklyRequirementSchema = z.object({
  teamId: z.string(),
  weekStartAt: z.date(),
  weekEndAt: z.date(),
  requiredMinutes: z.number().int().nonnegative(),
});

export const WeeklyRequirementInputSchema = z.object({
  teamId: z.string(),
  weekStartAt: z.coerce.date(),
  requiredMinutes: z.number().int().nonnegative(),
});

export const ExemptionSchema = z.object({
  athleteId: z.string(),
  weekStartAt: z.date(),
  reason: z.string().nullable(),
  createdBy: z.string(),
});

export const ExemptionInputSchema = z.object({
  athleteId: z.string(),
  weekStartAt: z.coerce.date(),
  reason: z.string().nullable().optional(),
});

export const WeeklyAggregateSchema = z.object({
  athleteId: z.string(),
  weekStartAt: z.date(),
  weekEndAt: z.date(),
  totalMinutes: z.number().int(),
  activityTypes: z.array(ActivityTypeSchema),
  hasHrData: z.boolean(),
  status: WeeklyStatusSchema,
});
