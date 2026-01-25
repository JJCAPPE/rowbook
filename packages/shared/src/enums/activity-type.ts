import { z } from "zod";

export const ActivityTypeValues = ["ERG", "RUN", "CYCLE", "SWIM", "OTHER"] as const;
export const ActivityTypeSchema = z.enum(ActivityTypeValues);
export type ActivityType = z.infer<typeof ActivityTypeSchema>;
