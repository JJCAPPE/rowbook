import { prisma } from "@/db/client";

export const upsertWeeklyRequirement = async (data: {
  teamId: string;
  weekStartAt: Date;
  weekEndAt: Date;
  requiredMinutes: number;
}) => {
  const rangeStart = new Date(data.weekStartAt.getTime() - 12 * 60 * 60 * 1000);
  const rangeEnd = new Date(data.weekStartAt.getTime() + 12 * 60 * 60 * 1000);

  const existing = await prisma.weeklyRequirement.findFirst({
    where: {
      teamId: data.teamId,
      weekStartAt: {
        gte: rangeStart,
        lte: rangeEnd,
      },
    },
  });

  if (existing) {
    return prisma.weeklyRequirement.update({
      where: { id: existing.id },
      data: {
        weekStartAt: data.weekStartAt,
        weekEndAt: data.weekEndAt,
        requiredMinutes: data.requiredMinutes,
      },
    });
  }

  return prisma.weeklyRequirement.create({ data });
};

export const getWeeklyRequirement = (teamId: string, weekStartAt: Date) => {
  const rangeStart = new Date(weekStartAt.getTime() - 12 * 60 * 60 * 1000);
  const rangeEnd = new Date(weekStartAt.getTime() + 12 * 60 * 60 * 1000);

  return prisma.weeklyRequirement.findFirst({
    where: {
      teamId,
      weekStartAt: {
        gte: rangeStart,
        lte: rangeEnd,
      },
    },
  });
};

export const listWeeklyRequirementsByTeamSince = (teamId: string, weekStartAt: Date) => {
  const bufferedStart = new Date(weekStartAt.getTime() - 12 * 60 * 60 * 1000);
  return prisma.weeklyRequirement.findMany({
    where: {
      teamId,
      weekStartAt: {
        gte: bufferedStart,
      },
    },
  });
};
