import { z } from "zod";

import { RoleSchema } from "../enums/role";
import { EmailSchema, IdSchema, IsoDateTimeSchema } from "./common";

export const LoginInputSchema = z.object({
  email: EmailSchema,
  password: z.string().min(8),
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

export const SessionSchema = z.object({
  userId: IdSchema,
  email: EmailSchema,
  role: RoleSchema,
  issuedAt: IsoDateTimeSchema,
  expiresAt: IsoDateTimeSchema,
});
export type Session = z.infer<typeof SessionSchema>;

export const LoginResponseSchema = z.object({
  session: SessionSchema,
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
import { z } from "zod";
import { UserSchema } from "./user";

export const LoginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const SessionSchema = z.object({
  user: UserSchema,
  expiresAt: z.date(),
});
