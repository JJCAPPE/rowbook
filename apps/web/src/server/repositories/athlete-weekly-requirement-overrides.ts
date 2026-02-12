import { prisma } from "@/db/client";

const getOverrideDelegate = () =>
  (prisma as unknown as { athleteWeeklyRequirementOverride?: any })
    .athleteWeeklyRequirementOverride;

const requireOverrideDelegate = () => {
  const delegate = getOverrideDelegate();
  if (!delegate) {
    throw new Error(
      "Athlete weekly override model is unavailable in Prisma client. Run prisma generate and restart the server.",
    );
  }
  return delegate;
};

export const upsertAthleteWeeklyRequirementOverride = (data: {
  athleteId: string;
  weekStartAt: Date;
  requiredMinutes: number;
  reason: string | null;
  createdBy: string;
}) =>
  requireOverrideDelegate().upsert({
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
) => {
  const delegate = getOverrideDelegate();
  if (!delegate) {
    return Promise.resolve(null);
  }
  return delegate.findFirst({
    where: {
      athleteId,
      weekStartAt: {
        gte: weekStartAt,
        lt: weekEndAt,
      },
    },
  });
};

export const listAthleteWeeklyRequirementOverridesByWeek = (
  weekStartAt: Date,
  weekEndAt: Date,
  teamId?: string,
) => {
  const delegate = getOverrideDelegate();
  if (!delegate) {
    return Promise.resolve([]);
  }
  return delegate.findMany({
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
};

export const listAthleteWeeklyRequirementOverridesByAthleteSince = (
  athleteId: string,
  weekStartAt: Date,
) => {
  const delegate = getOverrideDelegate();
  if (!delegate) {
    return Promise.resolve([]);
  }
  return delegate.findMany({
    where: {
      athleteId,
      weekStartAt: {
        gte: weekStartAt,
      },
    },
  });
};

export const deleteAthleteWeeklyRequirementOverrideById = (id: string) =>
  requireOverrideDelegate().delete({
    where: { id },
  });

export const deleteAthleteWeeklyRequirementOverrideByAthleteWeek = (
  athleteId: string,
  weekStartAt: Date,
) =>
  requireOverrideDelegate().delete({
    where: {
      athleteId_weekStartAt: {
        athleteId,
        weekStartAt,
      },
    },
  });
