import { ActivityType } from "../enums/activity-type";

export type ActivityEntry = {
  activityType: ActivityType;
  minutes: number;
  distance?: number | null;
  avgHr?: number | null;
};

export const sumMinutes = (entries: ActivityEntry[]) =>
  entries.reduce((sum, entry) => sum + entry.minutes, 0);

export const sumDistanceKm = (entries: ActivityEntry[]) =>
  entries.reduce((sum, entry) => sum + (entry.distance ?? 0), 0);

export const countSessions = (entries: ActivityEntry[]) => entries.length;

export const hasHrData = (entries: ActivityEntry[]) =>
  entries.some((entry) => entry.avgHr !== null && entry.avgHr !== undefined);

export const getActivityMix = (entries: ActivityEntry[]) => {
  const totals = new Map<ActivityType, number>();
  for (const entry of entries) {
    totals.set(entry.activityType, (totals.get(entry.activityType) ?? 0) + entry.minutes);
  }

  return Array.from(totals.entries()).map(([type, minutes]) => ({ type, minutes }));
};

export const getActivityTypes = (entries: ActivityEntry[]) =>
  Array.from(new Set(entries.map((entry) => entry.activityType)));
