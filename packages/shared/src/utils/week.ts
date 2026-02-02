import { DateInput, DEFAULT_TIMEZONE, toDateTime } from "./time";

export const WEEK_START_HOUR = 18;
export const WEEK_START_MINUTE = 0;

export const getWeekStartAt = (
  date: DateInput,
  timeZone = DEFAULT_TIMEZONE,
  cutoffHour = WEEK_START_HOUR,
): Date => {
  const zoned = toDateTime(date, timeZone);
  const daysSinceSunday = zoned.weekday % 7;

  let weekStart = zoned
    .minus({ days: daysSinceSunday })
    .set({
      hour: cutoffHour,
      minute: WEEK_START_MINUTE,
      second: 0,
      millisecond: 0,
    });

  if (zoned.toMillis() < weekStart.toMillis()) {
    weekStart = weekStart.minus({ weeks: 1 });
  }

  return weekStart.toUTC().toJSDate();
};

export const getWeekEndAt = (
  weekStartAt: DateInput,
  timeZone = DEFAULT_TIMEZONE,
): Date => {
  const start = toDateTime(weekStartAt, timeZone);
  return start.plus({ weeks: 1 }).toUTC().toJSDate();
};

export const getPreviousWeekStartAt = (
  date: DateInput,
  timeZone = DEFAULT_TIMEZONE,
  cutoffHour = WEEK_START_HOUR,
): Date => {
  const currentWeekStart = getWeekStartAt(date, timeZone, cutoffHour);
  return toDateTime(currentWeekStart, timeZone).minus({ weeks: 1 }).toUTC().toJSDate();
};

export const getWeekRange = (
  date: DateInput,
  timeZone = DEFAULT_TIMEZONE,
  cutoffHour = WEEK_START_HOUR,
): {
  weekStartAt: Date;
  weekEndAt: Date;
} => {
  const weekStartAt = getWeekStartAt(date, timeZone, cutoffHour);
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
  return (
    target.toMillis() >= start.toMillis() && target.toMillis() < end.toMillis()
  );
};

export const isWithinActiveWeek = (
  date: DateInput,
  timeZone = DEFAULT_TIMEZONE,
  referenceDate: DateInput = new Date(),
  cutoffHour = WEEK_START_HOUR,
): boolean => {
  const activeWeekStart = getWeekStartAt(referenceDate, timeZone, cutoffHour);
  return isWithinWeek(date, activeWeekStart, timeZone);
};

export const getIsoWeekKey = (
  date: DateInput,
  timeZone = DEFAULT_TIMEZONE,
): string => {
  // Normalize to UTC Date
  const d = new Date(toDateTime(date, timeZone).toMillis());
  
  // Implementation of ISO week number
  const day = d.getUTCDay();
  const diff = (day <= 3 ? day : day - 7) + 3;
  d.setUTCDate(d.getUTCDate() - diff + 3);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNumber).padStart(2, '0')}`;
};
