import { prisma } from "@/db/client";

export const upsertExemption = (data: {
  athleteId: string;
  weekStartAt: Date;
  reason: string | null;
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
      createdBy: data.createdBy,
    },
    create: data,
  });

export const getExemption = (athleteId: string, weekStartAt: Date) =>
  prisma.exemption.findUnique({
    where: {
      athleteId_weekStartAt: {
        athleteId,
        weekStartAt,
      },
    },
  });

export const listExemptionsByWeek = (weekStartAt: Date, teamId?: string) =>
  prisma.exemption.findMany({
    where: {
      weekStartAt,
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

export const deleteExemption = (athleteId: string, weekStartAt: Date) =>
  prisma.exemption.delete({
    where: {
      athleteId_weekStartAt: {
        athleteId,
        weekStartAt,
      },
    },
  });
