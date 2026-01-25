import { z } from "zod";

export const ValidationStatusValues = [
  "NOT_CHECKED",
  "PENDING",
  "VERIFIED",
  "REJECTED",
  "EXTRACTION_INCOMPLETE",
] as const;
export const ValidationStatusSchema = z.enum(ValidationStatusValues);
export type ValidationStatus = z.infer<typeof ValidationStatusSchema>;
