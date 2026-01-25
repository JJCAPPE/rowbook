import { prisma } from "@/db/client";
import { ActivityType, WeeklyStatus } from "@rowbook/shared";

export const upsertWeeklyAggregate = (data: {
  athleteId: string;
  teamId: string;
  weekStartAt: Date;
  weekEndAt: Date;
  totalMinutes: number;
  activityTypes: ActivityType[];
  hasHrData: boolean;
  status: WeeklyStatus;
}) =>
  prisma.weeklyAggregate.upsert({
    where: {
      athleteId_weekStartAt: {
        athleteId: data.athleteId,
        weekStartAt: data.weekStartAt,
      },
    },
    update: {
      teamId: data.teamId,
      weekEndAt: data.weekEndAt,
      totalMinutes: data.totalMinutes,
      activityTypes: data.activityTypes,
      hasHrData: data.hasHrData,
      status: data.status,
    },
    create: data,
  });

export const getWeeklyAggregate = (athleteId: string, weekStartAt: Date) =>
  prisma.weeklyAggregate.findUnique({
    where: {
      athleteId_weekStartAt: {
        athleteId,
        weekStartAt,
      },
    },
  });

export const listWeeklyAggregatesByAthlete = (athleteId: string) =>
  prisma.weeklyAggregate.findMany({
    where: { athleteId },
    orderBy: { weekStartAt: "desc" },
  });

export const listWeeklyAggregatesByTeamWeek = (teamId: string, weekStartAt: Date) =>
  prisma.weeklyAggregate.findMany({
    where: { teamId, weekStartAt },
    orderBy: { totalMinutes: "desc" },
  });

export const listWeeklyAggregatesByTeamWeekWithAthlete = (teamId: string, weekStartAt: Date) =>
  prisma.weeklyAggregate.findMany({
    where: { teamId, weekStartAt },
    include: { athlete: true },
    orderBy: { totalMinutes: "desc" },
  });
