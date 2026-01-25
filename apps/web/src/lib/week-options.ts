import { getPreviousWeekStartAt, getWeekEndAt, getWeekRange } from "@rowbook/shared";

import { formatWeekRange } from "@/lib/format";

export type WeekOption = {
  key: string;
  start: Date;
  end: Date;
  label: string;
};

export const getWeekKey = (weekStartAt: Date) => weekStartAt.toISOString();

export const buildWeekOptions = (count = 6, referenceDate = new Date()): WeekOption[] => {
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
