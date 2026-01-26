import { prisma } from "@/db/client";

export const upsertWeeklyRequirement = (data: {
  teamId: string;
  weekStartAt: Date;
  weekEndAt: Date;
  requiredMinutes: number;
}) =>
  prisma.weeklyRequirement.upsert({
    where: {
      teamId_weekStartAt: {
        teamId: data.teamId,
        weekStartAt: data.weekStartAt,
      },
    },
    update: {
      weekEndAt: data.weekEndAt,
      requiredMinutes: data.requiredMinutes,
    },
    create: data,
  });

export const getWeeklyRequirement = (teamId: string, weekStartAt: Date) =>
  prisma.weeklyRequirement.findUnique({
    where: {
      teamId_weekStartAt: {
        teamId,
        weekStartAt,
      },
    },
  });

export const listWeeklyRequirementsByTeamSince = (teamId: string, weekStartAt: Date) =>
  prisma.weeklyRequirement.findMany({
    where: {
      teamId,
      weekStartAt: {
        gte: weekStartAt,
      },
    },
  });
