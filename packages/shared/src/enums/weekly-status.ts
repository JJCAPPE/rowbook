import { z } from "zod";

export const WeeklyStatusValues = ["MET", "NOT_MET", "EXEMPT"] as const;
export const WeeklyStatusSchema = z.enum(WeeklyStatusValues);
export type WeeklyStatus = z.infer<typeof WeeklyStatusSchema>;
