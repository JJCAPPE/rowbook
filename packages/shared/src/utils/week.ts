import { DateInput, DEFAULT_TIMEZONE, toDateTime } from "./time";

export const WEEK_START_HOUR = 18;
export const WEEK_START_MINUTE = 0;

export const getWeekStartAt = (date: DateInput, timeZone = DEFAULT_TIMEZONE): Date => {
  const zoned = toDateTime(date, timeZone);
  const daysSinceSunday = zoned.weekday % 7;

  let weekStart = zoned
    .minus({ days: daysSinceSunday })
    .set({ hour: WEEK_START_HOUR, minute: WEEK_START_MINUTE, second: 0, millisecond: 0 });

  if (zoned.toMillis() < weekStart.toMillis()) {
    weekStart = weekStart.minus({ weeks: 1 });
  }

  return weekStart.toUTC().toJSDate();
};

export const getWeekEndAt = (weekStartAt: DateInput, timeZone = DEFAULT_TIMEZONE): Date => {
  const start = toDateTime(weekStartAt, timeZone);
  return start.plus({ weeks: 1 }).toUTC().toJSDate();
};

export const getWeekRange = (date: DateInput, timeZone = DEFAULT_TIMEZONE): {
  weekStartAt: Date;
  weekEndAt: Date;
} => {
  const weekStartAt = getWeekStartAt(date, timeZone);
  return { weekStartAt, weekEndAt: getWeekEndAt(weekStartAt, timeZone) };
};

export const isWithinWeek = (
  date: DateInput,
  weekStartAt: DateInput,
  timeZone = DEFAULT_TIMEZONE,
): boolean => {
  const target = toDateTime(date, timeZone);
  const start = toDateTime(weekStartAt, timeZone);
  const end = start.plus({ weeks: 1 });
  return target.toMillis() >= start.toMillis() && target.toMillis() < end.toMillis();
};

export const isWithinActiveWeek = (
  date: DateInput,
  timeZone = DEFAULT_TIMEZONE,
  referenceDate: DateInput = new Date(),
): boolean => {
  const activeWeekStart = getWeekStartAt(referenceDate, timeZone);
  return isWithinWeek(date, activeWeekStart, timeZone);
};
import { DateTime } from "luxon";
import { DEFAULT_TIMEZONE, toZonedDateTime } from "./time";

const CUTOFF_HOUR = 18;
const CUTOFF_MINUTE = 0;

export const getWeekStartAt = (date: Date, timezone = DEFAULT_TIMEZONE): Date => {
  const zoned = toZonedDateTime(date, timezone);
  const daysSinceSunday = zoned.weekday % 7;
  let candidate = zoned
    .minus({ days: daysSinceSunday })
    .set({ hour: CUTOFF_HOUR, minute: CUTOFF_MINUTE, second: 0, millisecond: 0 });

  if (zoned < candidate) {
    candidate = candidate.minus({ days: 7 });
  }

  return candidate.toJSDate();
};

export const getWeekEndAt = (weekStartAt: Date, timezone = DEFAULT_TIMEZONE): Date => {
  const start = toZonedDateTime(weekStartAt, timezone);
  return start.plus({ days: 7 }).toJSDate();
};

export const getPreviousWeekStartAt = (date: Date, timezone = DEFAULT_TIMEZONE): Date => {
  const currentWeekStart = getWeekStartAt(date, timezone);
  return toZonedDateTime(currentWeekStart, timezone).minus({ days: 7 }).toJSDate();
};

export const isWithinWeek = (
  date: Date,
  weekStartAt: Date,
  timezone = DEFAULT_TIMEZONE,
): boolean => {
  const start = toZonedDateTime(weekStartAt, timezone);
  const end = start.plus({ days: 7 });
  const target = toZonedDateTime(date, timezone);
  return target >= start && target < end;
};

export const getWeekRange = (date: Date, timezone = DEFAULT_TIMEZONE) => {
  const weekStartAt = getWeekStartAt(date, timezone);
  const weekEndAt = getWeekEndAt(weekStartAt, timezone);
  return { weekStartAt, weekEndAt };
};

export const isWithinActiveWeek = (
  date: Date,
  now: Date = new Date(),
  timezone = DEFAULT_TIMEZONE,
): boolean => {
  const { weekStartAt } = getWeekRange(now, timezone);
  return isWithinWeek(date, weekStartAt, timezone);
};
