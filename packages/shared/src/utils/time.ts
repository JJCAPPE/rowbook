import { DateTime, Settings } from "luxon";
 
export type DateInput = Date | string | number | DateTime;
 
export const DEFAULT_TIMEZONE = "America/New_York";
 
// Ensure all Luxon operations use New York time by default
Settings.defaultZone = DEFAULT_TIMEZONE;
 
export const DEFAULT_TIME_FORMAT = "yyyy-LL-dd"; // Changed from "yyyy-LL-dd'T'HH:mm:ssZZ"
 
export const toDateTime = (
  input: DateInput,
  timeZone = DEFAULT_TIMEZONE,
): DateTime => {
  if (DateTime.isDateTime(input)) {
    return input.setZone(timeZone, { keepLocalTime: false });
  }

  if (input instanceof Date) {
    return DateTime.fromJSDate(input, { zone: timeZone });
  }

  if (typeof input === "number") {
    return DateTime.fromMillis(input, { zone: timeZone });
  }

  const parsed = DateTime.fromISO(input, { zone: timeZone });
  if (parsed.isValid) {
    return parsed;
  }

  return DateTime.fromJSDate(new Date(input), { zone: timeZone });
};

export const toUtcDate = (input: DateInput): Date =>
  toDateTime(input, "UTC").toJSDate();

export const toZonedDate = (
  input: DateInput,
  timeZone = DEFAULT_TIMEZONE,
): Date => toDateTime(input, timeZone).toJSDate();

export const toZonedDateTime = (
  input: DateInput,
  timeZone = DEFAULT_TIMEZONE,
): DateTime => toDateTime(input, timeZone);

export const nowInZone = (timeZone = DEFAULT_TIMEZONE): DateTime =>
  DateTime.now().setZone(timeZone);

export const formatInTimeZone = (
  input: DateInput,
  timeZone = DEFAULT_TIMEZONE,
  format = DEFAULT_TIME_FORMAT,
): string => toDateTime(input, timeZone).toFormat(format);

/**
 * Parse a date-only string (YYYY-MM-DD) as noon in New York timezone.
 * This avoids timezone shift issues that occur when using `new Date("YYYY-MM-DD")`
 * which interprets the string as UTC midnight, causing the date to roll back
 * when converted to EST/EDT.
 */
export const parseDateStringAsNewYorkNoon = (dateString: string): Date => {
  // Parse as noon in New York to avoid any timezone edge cases
  const dt = DateTime.fromISO(`${dateString}T12:00:00`, { zone: DEFAULT_TIMEZONE });
  if (!dt.isValid) {
    throw new Error(`Invalid date string: ${dateString}`);
  }
  return dt.toJSDate();
};
