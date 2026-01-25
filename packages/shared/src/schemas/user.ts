import { z } from "zod";

import { RoleSchema } from "../enums/role";
import { UserStatusSchema } from "../enums/user-status";
import { EmailSchema, NonEmptyStringSchema } from "./common";

export const UserSchema = z.object({
  id: z.string(),
  email: EmailSchema,
  name: NonEmptyStringSchema.nullable(),
  role: RoleSchema,
  status: UserStatusSchema,
});
export type User = z.infer<typeof UserSchema>;

export const TeamSchema = z.object({
  id: z.string(),
  name: NonEmptyStringSchema,
  timezone: z.string().min(1),
});
export type Team = z.infer<typeof TeamSchema>;

export const AthleteProfileSchema = z.object({
  id: z.string(),
  userId: z.string(),
  teamId: z.string(),
  notes: z.string().max(500).nullable().optional(),
});
export type AthleteProfile = z.infer<typeof AthleteProfileSchema>;
