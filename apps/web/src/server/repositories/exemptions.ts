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

export const getExemption = (athleteId: string, weekStartAt: Date) => {
  const rangeStart = new Date(weekStartAt.getTime() - 12 * 60 * 60 * 1000);
  const rangeEnd = new Date(weekStartAt.getTime() + 12 * 60 * 60 * 1000);

  return prisma.exemption.findFirst({
    where: {
      athleteId,
      OR: [
        {
          weekStartAt: {
            gte: rangeStart,
            lte: rangeEnd,
          },
        },
        {
          isIndefinite: true,
          weekStartAt: {
            lte: rangeEnd,
          },
        },
      ],
    },
  });
};

export const listExemptionsByWeek = (weekStartAt: Date, teamId?: string) => {
  const rangeStart = new Date(weekStartAt.getTime() - 12 * 60 * 60 * 1000);
  const rangeEnd = new Date(weekStartAt.getTime() + 12 * 60 * 60 * 1000);

  return prisma.exemption.findMany({
    where: {
      OR: [
        {
          weekStartAt: {
            gte: rangeStart,
            lte: rangeEnd,
          },
        },
        {
          isIndefinite: true,
          weekStartAt: {
            lte: rangeEnd,
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
  const bufferedStart = new Date(weekStartAt.getTime() - 12 * 60 * 60 * 1000);
  return prisma.exemption.findMany({
    where: {
      athleteId,
      weekStartAt: {
        gte: bufferedStart,
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
