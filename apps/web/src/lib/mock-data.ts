import {
  ACTIVITY_TYPE_LABELS,
  ActivityType,
  ValidationStatus,
  WeeklyStatus,
} from "@rowbook/shared";

import { formatWeekRange } from "./format";

const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86400000);

const weekStart = new Date("2026-01-18T23:00:00.000Z");
const weekEnd = addDays(weekStart, 7);

export const weekOptions = Array.from({ length: 6 }).map((_, index) => {
  const start = addDays(weekStart, -7 * index);
  const end = addDays(start, 7);
  return {
    key: start.toISOString().slice(0, 10),
    start,
    end,
    label: formatWeekRange(start, end),
  };
});

export const athleteProfile = {
  name: "Maya Chen",
  requiredMinutes: 240,
  weekStart,
  weekEnd,
  totalMinutes: 198,
  totalDistanceKm: 46.2,
  sessions: 4,
  hasHr: true,
};

export type Entry = {
  id: string;
  date: Date;
  activityType: ActivityType;
  minutes: number;
  distanceKm: number | null;
  avgHr: number | null;
  status: ValidationStatus;
  notes?: string;
  proofUrl: string;
};

export const recentEntries: Entry[] = [
  {
    id: "entry-1",
    date: addDays(weekStart, 1),
    activityType: "ERG",
    minutes: 45,
    distanceKm: 11.3,
    avgHr: 162,
    status: "VERIFIED",
    notes: "Steady state piece.",
    proofUrl:
      "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "entry-2",
    date: addDays(weekStart, 3),
    activityType: "RUN",
    minutes: 38,
    distanceKm: 7.4,
    avgHr: 171,
    status: "NOT_CHECKED",
    notes: "Tempo run.",
    proofUrl:
      "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: "entry-3",
    date: addDays(weekStart, 5),
    activityType: "CYCLE",
    minutes: 52,
    distanceKm: 18.6,
    avgHr: 155,
    status: "PENDING",
    notes: "Trainer ride.",
    proofUrl:
      "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=800&q=80",
  },
];

export const weeklyTrend = [
  { week: weekOptions[5].label, minutes: 180 },
  { week: weekOptions[4].label, minutes: 210 },
  { week: weekOptions[3].label, minutes: 195 },
  { week: weekOptions[2].label, minutes: 240 },
  { week: weekOptions[1].label, minutes: 260 },
  { week: weekOptions[0].label, minutes: athleteProfile.totalMinutes },
];

export const athleteHistory = [
  {
    weekStart: weekOptions[0].start,
    weekEnd: weekOptions[0].end,
    totalMinutes: 198,
    status: "NOT_MET" as WeeklyStatus,
  },
  {
    weekStart: weekOptions[1].start,
    weekEnd: weekOptions[1].end,
    totalMinutes: 260,
    status: "MET" as WeeklyStatus,
  },
  {
    weekStart: weekOptions[2].start,
    weekEnd: weekOptions[2].end,
    totalMinutes: 0,
    status: "EXEMPT" as WeeklyStatus,
  },
  {
    weekStart: weekOptions[3].start,
    weekEnd: weekOptions[3].end,
    totalMinutes: 220,
    status: "MET" as WeeklyStatus,
  },
];

export const leaderboardRows = [
  {
    id: "athlete-1",
    name: "Maya Chen",
    totalMinutes: 255,
    status: "MET" as WeeklyStatus,
    activityTypes: ["ERG", "RUN", "CYCLE"] as ActivityType[],
    hasHr: true,
  },
  {
    id: "athlete-2",
    name: "Jared Patel",
    totalMinutes: 210,
    status: "NOT_MET" as WeeklyStatus,
    activityTypes: ["ERG", "RUN"] as ActivityType[],
    hasHr: false,
  },
  {
    id: "athlete-3",
    name: "Luis Garcia",
    totalMinutes: 310,
    status: "MET" as WeeklyStatus,
    activityTypes: ["ERG", "CYCLE", "SWIM"] as ActivityType[],
    hasHr: true,
  },
  {
    id: "athlete-4",
    name: "Keisha Osei",
    totalMinutes: 0,
    status: "EXEMPT" as WeeklyStatus,
    activityTypes: ["OTHER"] as ActivityType[],
    hasHr: false,
  },
];

export const coachSummary = {
  requiredMinutes: 240,
  metCount: 12,
  notMetCount: 4,
  exemptCount: 2,
};

export const coachAthleteDetail = {
  id: "athlete-1",
  name: athleteProfile.name,
  weeklyTrend: weeklyTrend.map((point) => ({
    week: point.week,
    minutes: point.minutes,
  })),
  activityMix: [
    { type: "ERG", minutes: 420 },
    { type: "RUN", minutes: 210 },
    { type: "CYCLE", minutes: 120 },
    { type: "SWIM", minutes: 60 },
  ],
  entries: recentEntries,
};

export const reviewQueue = recentEntries.map((entry) => ({
  ...entry,
  status: entry.status === "VERIFIED" ? "NOT_CHECKED" : entry.status,
}));

export const weeklySettings = {
  weekStart,
  weekEnd,
  requiredMinutes: 240,
  exemptions: [
    { id: "ex-1", athlete: "Keisha Osei", reason: "Injury recovery" },
    { id: "ex-2", athlete: "Theo Park", reason: "Academic travel" },
  ],
};

export const activityLabels = ACTIVITY_TYPE_LABELS;
