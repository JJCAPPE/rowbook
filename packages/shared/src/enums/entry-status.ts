import { z } from "zod";

export const EntryStatusValues = ["ACTIVE", "LOCKED"] as const;
export const EntryStatusSchema = z.enum(EntryStatusValues);
export type EntryStatus = z.infer<typeof EntryStatusSchema>;
