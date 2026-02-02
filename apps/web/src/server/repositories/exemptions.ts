import { prisma } from "@/db/client";

export const upsertExemption = (data: {
  athleteId: string;
  weekStartAt: Date;
  reason: string | null;
  isIndefinite?: boolean;
  createdBy: string;
}) =>
  prisma.exemption.upsert({
    where: {
      athleteId_weekStartAt: {
        athleteId: data.athleteId,
        weekStartAt: data.weekStartAt,
      },
    },
    update: {
      reason: data.reason,
      isIndefinite: data.isIndefinite ?? false,
      createdBy: data.createdBy,
    },
    create: {
      ...data,
      isIndefinite: data.isIndefinite ?? false,
    },
  });

export const getExemption = (athleteId: string, weekStartAt: Date, weekEndAt: Date) => {
  return prisma.exemption.findFirst({
    where: {
      athleteId,
      OR: [
        {
          weekStartAt: {
            gte: weekStartAt,
            lt: weekEndAt,
          },
        },
        {
          isIndefinite: true,
          weekStartAt: {
            lt: weekEndAt,
          },
        },
      ],
    },
  });
};

export const listExemptionsByWeek = (weekStartAt: Date, weekEndAt: Date, teamId?: string) => {
  return prisma.exemption.findMany({
    where: {
      OR: [
        {
          weekStartAt: {
            gte: weekStartAt,
            lt: weekEndAt,
          },
        },
        {
          isIndefinite: true,
          weekStartAt: {
            lt: weekEndAt,
          },
        },
      ],
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
    include: { athlete: true },
  });
};

export const listExemptionsByAthleteSince = (athleteId: string, weekStartAt: Date) => {
  return prisma.exemption.findMany({
    where: {
      athleteId,
      weekStartAt: {
        gte: weekStartAt,
      },
    },
  });
};

export const deleteExemption = (athleteId: string, weekStartAt: Date) =>
  prisma.exemption.delete({
    where: {
      athleteId_weekStartAt: {
        athleteId,
        weekStartAt,
      },
    },
  });
