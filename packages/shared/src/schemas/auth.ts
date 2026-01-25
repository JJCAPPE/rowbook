import { z } from "zod";

import { EmailSchema } from "./common";
import { UserSchema } from "./user";

export const LoginInputSchema = z.object({
  email: EmailSchema,
  password: z.string().min(6),
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

export const SessionSchema = z.object({
  user: UserSchema,
  expiresAt: z.date(),
});
export type Session = z.infer<typeof SessionSchema>;

export const LoginResponseSchema = z.object({
  session: SessionSchema,
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
