import type { ValidationStatus } from "@rowbook/shared";

type HeartRateEntry = {
  minutes: number;
  avgHr?: number | null;
};

type WeeklyHeartRateEntry = HeartRateEntry & {
  weekStartAt: Date;
  validationStatus: ValidationStatus;
};

export const getWeightedAvgHr = (entries: HeartRateEntry[]) => {
  let totalMinutes = 0;
  let weightedSum = 0;

  for (const entry of entries) {
    if (entry.avgHr === null || entry.avgHr === undefined || entry.minutes <= 0) {
      continue;
    }
    totalMinutes += entry.minutes;
    weightedSum += entry.avgHr * entry.minutes;
  }

  if (totalMinutes === 0) {
    return null;
  }

  return Math.round(weightedSum / totalMinutes);
};

export const getWeightedAvgHrByWeek = (entries: WeeklyHeartRateEntry[]) => {
  const entriesByWeek = new Map<string, HeartRateEntry[]>();

  for (const entry of entries) {
    if (entry.validationStatus === "REJECTED") {
      continue;
    }
    const key = entry.weekStartAt.toISOString();
    const current = entriesByWeek.get(key) ?? [];
    current.push({ minutes: entry.minutes, avgHr: entry.avgHr });
    entriesByWeek.set(key, current);
  }

  const avgHrByWeek = new Map<string, number | null>();
  for (const [key, weekEntries] of entriesByWeek.entries()) {
    avgHrByWeek.set(key, getWeightedAvgHr(weekEntries));
  }

  return avgHrByWeek;
};
