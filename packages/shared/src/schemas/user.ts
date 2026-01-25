import { z } from "zod";

import { RoleSchema } from "../enums/role";
import { UserStatusSchema } from "../enums/user-status";
import { EmailSchema, IdSchema, IsoDateTimeSchema, NonEmptyStringSchema } from "./common";

export const UserSchema = z.object({
  id: IdSchema,
  email: EmailSchema,
  name: NonEmptyStringSchema,
  role: RoleSchema,
  status: UserStatusSchema,
  createdAt: IsoDateTimeSchema,
});
export type User = z.infer<typeof UserSchema>;

export const TeamSchema = z.object({
  id: IdSchema,
  name: NonEmptyStringSchema,
  timezone: z.string().min(1),
});
export type Team = z.infer<typeof TeamSchema>;

export const AthleteProfileSchema = z.object({
  userId: IdSchema,
  teamId: IdSchema,
  notes: z.string().max(500).optional().nullable(),
  createdAt: IsoDateTimeSchema,
});
export type AthleteProfile = z.infer<typeof AthleteProfileSchema>;
import { z } from "zod";
import { RoleSchema, UserStatusSchema } from "../enums";

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().nullable(),
  role: RoleSchema,
  status: UserStatusSchema,
});

export const AthleteProfileSchema = z.object({
  id: z.string(),
  userId: z.string(),
  teamId: z.string(),
  notes: z.string().nullable(),
});
