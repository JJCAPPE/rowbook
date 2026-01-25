import { z } from "zod";

import { ActivityTypeSchema } from "../enums/activity-type";
import { WeeklyStatusSchema } from "../enums/weekly-status";

export const WeekRangeSchema = z.object({
  weekStartAt: z.date(),
  weekEndAt: z.date(),
});
export type WeekRange = z.infer<typeof WeekRangeSchema>;

export const WeeklyRequirementSchema = WeekRangeSchema.extend({
  teamId: z.string(),
  requiredMinutes: z.number().int().nonnegative(),
});
export type WeeklyRequirement = z.infer<typeof WeeklyRequirementSchema>;

export const WeeklyRequirementInputSchema = z.object({
  teamId: z.string(),
  weekStartAt: z.coerce.date(),
  requiredMinutes: z.number().int().nonnegative(),
});
export type WeeklyRequirementInput = z.infer<typeof WeeklyRequirementInputSchema>;

export const ExemptionSchema = z.object({
  athleteId: z.string(),
  weekStartAt: z.date(),
  reason: z.string().max(500).nullable(),
  createdBy: z.string(),
  createdAt: z.date(),
});
export type Exemption = z.infer<typeof ExemptionSchema>;

export const ExemptionInputSchema = z.object({
  athleteId: z.string(),
  weekStartAt: z.coerce.date(),
  reason: z.string().max(500).nullable().optional(),
});
export type ExemptionInput = z.infer<typeof ExemptionInputSchema>;

export const WeeklyAggregateSchema = WeekRangeSchema.extend({
  athleteId: z.string(),
  totalMinutes: z.number().int().nonnegative(),
  activityTypes: z.array(ActivityTypeSchema),
  hasHrData: z.boolean(),
  status: WeeklyStatusSchema,
});
export type WeeklyAggregate = z.infer<typeof WeeklyAggregateSchema>;
