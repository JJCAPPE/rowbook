import { prisma } from "@/db/client";

export const upsertAthleteWeeklyRequirementOverride = (data: {
  athleteId: string;
  weekStartAt: Date;
  requiredMinutes: number;
  reason: string | null;
  createdBy: string;
}) =>
  prisma.athleteWeeklyRequirementOverride.upsert({
    where: {
      athleteId_weekStartAt: {
        athleteId: data.athleteId,
        weekStartAt: data.weekStartAt,
      },
    },
    update: {
      requiredMinutes: data.requiredMinutes,
      reason: data.reason,
      createdBy: data.createdBy,
    },
    create: data,
  });

export const getAthleteWeeklyRequirementOverride = (
  athleteId: string,
  weekStartAt: Date,
  weekEndAt: Date,
) =>
  prisma.athleteWeeklyRequirementOverride.findFirst({
    where: {
      athleteId,
      weekStartAt: {
        gte: weekStartAt,
        lt: weekEndAt,
      },
    },
  });

export const listAthleteWeeklyRequirementOverridesByWeek = (
  weekStartAt: Date,
  weekEndAt: Date,
  teamId?: string,
) =>
  prisma.athleteWeeklyRequirementOverride.findMany({
    where: {
      weekStartAt: {
        gte: weekStartAt,
        lt: weekEndAt,
      },
      ...(teamId
        ? {
            athlete: {
              athleteProfile: {
                teamId,
              },
            },
          }
        : {}),
    },
    include: {
      athlete: true,
    },
  });

export const listAthleteWeeklyRequirementOverridesByAthleteSince = (
  athleteId: string,
  weekStartAt: Date,
) =>
  prisma.athleteWeeklyRequirementOverride.findMany({
    where: {
      athleteId,
      weekStartAt: {
        gte: weekStartAt,
      },
    },
  });

export const deleteAthleteWeeklyRequirementOverrideById = (id: string) =>
  prisma.athleteWeeklyRequirementOverride.delete({
    where: { id },
  });

export const deleteAthleteWeeklyRequirementOverrideByAthleteWeek = (
  athleteId: string,
  weekStartAt: Date,
) =>
  prisma.athleteWeeklyRequirementOverride.delete({
    where: {
      athleteId_weekStartAt: {
        athleteId,
        weekStartAt,
      },
    },
  });
