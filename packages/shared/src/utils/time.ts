import { DateTime } from "luxon";

export type DateInput = Date | string | number | DateTime;

export const DEFAULT_TIMEZONE = "America/New_York";

export const DEFAULT_TIME_FORMAT = "yyyy-LL-dd'T'HH:mm:ssZZ";

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
