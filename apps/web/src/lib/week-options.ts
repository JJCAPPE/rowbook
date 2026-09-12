import { getPreviousWeekStartAt, getWeekEndAt, getWeekRange } from "@rowbook/shared";

import { formatWeekRange } from "@/lib/format";

export type WeekOption = {
  key: string;
  start: Date;
  end: Date;
  label: string;
};

export const SEASON_WEEK_OPTION_COUNT = 32;

export const getWeekKey = (weekStartAt: Date) => weekStartAt.toISOString();

export const getWeekOptionsRefreshDelay = (referenceDate = new Date()) => {
  const nextCutoff = getWeekRange(referenceDate).weekEndAt;
  return Math.max(250, nextCutoff.getTime() - referenceDate.getTime() + 250);
};

export const buildWeekOptions = (
  count = SEASON_WEEK_OPTION_COUNT,
  referenceDate = new Date(),
): WeekOption[] => {
  const options: WeekOption[] = [];
  let currentStart = getWeekRange(referenceDate).weekStartAt;

  for (let index = 0; index < count; index += 1) {
    const start = new Date(currentStart);
    const end = getWeekEndAt(start);
    options.push({
      key: getWeekKey(start),
      start,
      end,
      label: formatWeekRange(start, end),
    });
    currentStart = getPreviousWeekStartAt(currentStart);
  }

  return options;
};
