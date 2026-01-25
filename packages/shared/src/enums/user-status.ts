import { z } from "zod";

export const UserStatusValues = ["ACTIVE", "INACTIVE"] as const;
export const UserStatusSchema = z.enum(UserStatusValues);
export type UserStatus = z.infer<typeof UserStatusSchema>;
