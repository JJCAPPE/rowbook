import { DateTime } from "luxon";

import { getPreviousWeekStartAt, getWeekEndAt, getWeekStartAt } from "@rowbook/shared";

export const WEEKLY_RECAP_TIME_ZONE = "America/New_York";
export const WEEKLY_RECAP_CATCH_UP_MS = 48 * 60 * 60 * 1_000;

export const getWeeklyRecapWindow = (now: Date) => {
  const currentWeekStartAt = getWeekStartAt(now, WEEKLY_RECAP_TIME_ZONE);
  const recapWeekStartAt = getPreviousWeekStartAt(now, WEEKLY_RECAP_TIME_ZONE);
  const recapWeekEndAt = getWeekEndAt(recapWeekStartAt, WEEKLY_RECAP_TIME_ZONE);
  const windowEndsAt = new Date(
    currentWeekStartAt.getTime() + WEEKLY_RECAP_CATCH_UP_MS,
  );
  const elapsedMs = now.getTime() - currentWeekStartAt.getTime();
  const zonedNow = DateTime.fromJSDate(now).setZone(WEEKLY_RECAP_TIME_ZONE);
  const isInitialWindow = zonedNow.weekday === 7 && zonedNow.hour === 20;
  const isOpen = elapsedMs >= 0 && elapsedMs < WEEKLY_RECAP_CATCH_UP_MS;

  return {
    timezone: WEEKLY_RECAP_TIME_ZONE,
    now,
    isOpen,
    isInitialWindow,
    isCatchUpWindow: isOpen && !isInitialWindow,
    recapWeekStartAt,
    recapWeekEndAt,
    windowEndsAt,
  };
};
