import { DateInput, DEFAULT_TIMEZONE, toDateTime } from "./time";

export const WEEK_START_HOUR = 18;
export const WEEK_START_MINUTE = 0;

export const getWeekStartAt = (
  date: DateInput,
  timeZone = DEFAULT_TIMEZONE,
): Date => {
  const zoned = toDateTime(date, timeZone);
  const daysSinceSunday = zoned.weekday % 7;

  let weekStart = zoned
    .minus({ days: daysSinceSunday })
    .set({
      hour: WEEK_START_HOUR,
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
): Date => {
  const currentWeekStart = getWeekStartAt(date, timeZone);
  return toDateTime(currentWeekStart, timeZone).minus({ weeks: 1 }).toUTC().toJSDate();
};

export const getWeekRange = (
  date: DateInput,
  timeZone = DEFAULT_TIMEZONE,
): {
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
  return (
    target.toMillis() >= start.toMillis() && target.toMillis() < end.toMillis()
  );
};

export const isWithinActiveWeek = (
  date: DateInput,
  timeZone = DEFAULT_TIMEZONE,
  referenceDate: DateInput = new Date(),
): boolean => {
  const activeWeekStart = getWeekStartAt(referenceDate, timeZone);
  return isWithinWeek(date, activeWeekStart, timeZone);
};
