import { z } from "zod";

export const IdSchema = z.string().uuid();
export const EmailSchema = z.string().email().max(320);
export const IsoDateTimeSchema = z.string().datetime({ offset: true });
export const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const NonEmptyStringSchema = z.string().min(1);

export const MinutesSchema = z.number().int().positive();
export const DistanceSchema = z
  .number()
  .nonnegative()
  .max(500, "Distance looks too large — reminder: enter kilometers (km), not meters (m).");
export const HeartRateSchema = z.preprocess(
  (value) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return value;
    }
    // OCR can return decimal bpm values; normalize before integer validation.
    return Math.round(value);
  },
  z.number().int().positive(),
);
export const OptionalNotesSchema = z.string().max(1000).optional().nullable();
