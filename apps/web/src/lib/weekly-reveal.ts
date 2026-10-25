import type { ActivityType } from "@rowbook/shared";

export type WeeklyRevealAthlete = {
  athleteId: string;
  name: string;
  totalMinutes: number;
  previousWeekMinutes: number;
  activityTypes: ActivityType[];
  avgHr: number | null;
  percentChange: number | null;
  rank: number;
};

export type WeeklyReveal = {
  teamId: string;
  teamName: string;
  weekStartAt: Date;
  weekEndAt: Date;
  podium: WeeklyRevealAthlete[];
  mostImproved: WeeklyRevealAthlete | null;
  mostAdded: WeeklyRevealAthlete | null;
  missedTargetCount: number;
  zeroMinutesCount: number;
  athleteCount: number;
};
