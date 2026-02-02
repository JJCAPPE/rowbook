import { prisma } from "@/db/client";

export const upsertWeeklyRequirement = async (data: {
  teamId: string;
  weekStartAt: Date;
  weekEndAt: Date;
  requiredMinutes: number;
}) => {
  const existing = await prisma.weeklyRequirement.findFirst({
    where: {
      teamId: data.teamId,
      weekStartAt: {
        gte: data.weekStartAt,
        lt: data.weekEndAt,
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

export const getWeeklyRequirement = (teamId: string, weekStartAt: Date, weekEndAt: Date) => {
  return prisma.weeklyRequirement.findFirst({
    where: {
      teamId,
      weekStartAt: {
        gte: weekStartAt,
        lt: weekEndAt,
      },
    },
  });
};

export const listWeeklyRequirementsByTeamSince = (teamId: string, weekStartAt: Date) => {
  return prisma.weeklyRequirement.findMany({
    where: {
      teamId,
      weekStartAt: {
        gte: weekStartAt,
      },
    },
  });
};
