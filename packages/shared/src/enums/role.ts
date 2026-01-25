import { z } from "zod";

export const RoleValues = ["ATHLETE", "COACH", "ADMIN"] as const;
export const RoleSchema = z.enum(RoleValues);
export type Role = z.infer<typeof RoleSchema>;
