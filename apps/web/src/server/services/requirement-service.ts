import { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { getWeekEndAt, getWeekStartAt } from "@rowbook/shared";
import { prisma } from "@/db/client";

type TransactionClient = Prisma.TransactionClient;

const toInputJsonValue = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

const assertTeamAccess = async (
  tx: TransactionClient,
  actorId: string,
  teamId: string,
) => {
  const membership = await tx.coachTeamMembership.findUnique({
    where: { teamId_coachId: { teamId, coachId: actorId } },
    select: { teamId: true },
  });
  if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
};

const getAuthorizedAthleteTeam = async (
  tx: TransactionClient,
  actorId: string,
  athleteId: string,
) => {
  const profile = await tx.athleteProfile.findFirst({
    where: {
      userId: athleteId,
      team: { coaches: { some: { coachId: actorId } } },
    },
    select: { teamId: true },
  });
  if (!profile) throw new TRPCError({ code: "FORBIDDEN" });
  return profile.teamId;
};

const upsertRequirement = async (
  tx: TransactionClient,
  input: {
    actorId: string;
    teamId: string;
    weekStartAt: Date;
    requiredMinutes: number;
  },
) => {
  const weekEndAt = getWeekEndAt(input.weekStartAt);
  const requirement = await tx.weeklyRequirement.upsert({
    where: {
      teamId_weekStartAt: {
        teamId: input.teamId,
        weekStartAt: input.weekStartAt,
      },
    },
    update: { weekEndAt, requiredMinutes: input.requiredMinutes },
    create: {
      teamId: input.teamId,
      weekStartAt: input.weekStartAt,
      weekEndAt,
      requiredMinutes: input.requiredMinutes,
    },
  });
  await tx.auditLog.create({
    data: {
      actorId: input.actorId,
      entityType: "WEEKLY_REQUIREMENT",
      entityId: requirement.id,
      action: "UPSERT",
      after: toInputJsonValue(requirement),
    },
  });
  return requirement;
};

export const setWeeklyRequirement = async (
  actorId: string,
  teamId: string,
  weekStartAt: Date,
  requiredMinutes: number,
) =>
  prisma.$transaction(async (tx) => {
    await assertTeamAccess(tx, actorId, teamId);
    return upsertRequirement(tx, {
      actorId,
      teamId,
      weekStartAt: getWeekStartAt(weekStartAt),
      requiredMinutes,
    });
  });

export const setWeeklyRequirements = async (
  actorId: string,
  teamId: string,
  requirements: { weekStartAt: Date; requiredMinutes: number }[],
) => {
  const normalized = new Map<
    number,
    { weekStartAt: Date; requiredMinutes: number }
  >();
  for (const requirement of requirements) {
    const weekStartAt = getWeekStartAt(requirement.weekStartAt);
    normalized.set(weekStartAt.getTime(), {
      weekStartAt,
      requiredMinutes: requirement.requiredMinutes,
    });
  }

  return prisma.$transaction(async (tx) => {
    await assertTeamAccess(tx, actorId, teamId);
    const saved = [];
    for (const requirement of normalized.values()) {
      saved.push(
        await upsertRequirement(tx, {
          actorId,
          teamId,
          ...requirement,
        }),
      );
    }
    return saved;
  });
};

export const getWeeklyRequirementsRange = async (
  actorId: string,
  teamId: string,
  startAt: Date,
  endAt: Date,
) => {
  const membership = await prisma.coachTeamMembership.findUnique({
    where: { teamId_coachId: { teamId, coachId: actorId } },
    select: { teamId: true },
  });
  if (!membership) throw new TRPCError({ code: "FORBIDDEN" });
  return prisma.weeklyRequirement.findMany({
    where: { teamId, weekStartAt: { gte: startAt, lt: endAt } },
    orderBy: { weekStartAt: "asc" },
  });
};

export const setExemption = async (
  actorId: string,
  athleteId: string,
  weekStartAt: Date,
  reason: string | null,
  isIndefinite = false,
) =>
  prisma.$transaction(async (tx) => {
    await getAuthorizedAthleteTeam(tx, actorId, athleteId);
    const normalizedWeekStartAt = getWeekStartAt(weekStartAt);
    if (isIndefinite) {
      await tx.exemption.deleteMany({
        where: {
          athleteId,
          isIndefinite: true,
          weekStartAt: { not: normalizedWeekStartAt },
        },
      });
    }
    const exemption = await tx.exemption.upsert({
      where: {
        athleteId_weekStartAt: {
          athleteId,
          weekStartAt: normalizedWeekStartAt,
        },
      },
      update: { reason, isIndefinite, createdBy: actorId },
      create: {
        athleteId,
        weekStartAt: normalizedWeekStartAt,
        reason,
        isIndefinite,
        createdBy: actorId,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        entityType: "EXEMPTION",
        entityId: exemption.id,
        action: "UPSERT",
        after: toInputJsonValue(exemption),
      },
    });
    return exemption;
  });

export const removeExemption = async (actorId: string, exemptionId: string) =>
  prisma.$transaction(async (tx) => {
    const exemption = await tx.exemption.findUnique({
      where: { id: exemptionId },
    });
    if (!exemption) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Exemption not found.",
      });
    }
    await getAuthorizedAthleteTeam(tx, actorId, exemption.athleteId);
    const removed = exemption.isIndefinite
      ? await tx.exemption.deleteMany({
          where: { athleteId: exemption.athleteId, isIndefinite: true },
        })
      : await tx.exemption.delete({ where: { id: exemption.id } });
    await tx.auditLog.create({
      data: {
        actorId,
        entityType: "EXEMPTION",
        entityId: exemption.id,
        action: "DELETE",
        before: toInputJsonValue(exemption),
        after: toInputJsonValue(
          "count" in removed ? { deletedCount: removed.count } : removed,
        ),
      },
    });
    return { success: true };
  });

export const setAthleteWeeklyRequirementOverride = async (
  actorId: string,
  athleteId: string,
  weekStartAt: Date,
  requiredMinutes: number,
  reason: string | null,
) => {
  const normalizedWeekStartAt = getWeekStartAt(weekStartAt);
  if (
    normalizedWeekStartAt.getTime() !== getWeekStartAt(new Date()).getTime()
  ) {
    throw new Error(
      "Athlete weekly overrides can only be set for the current week.",
    );
  }

  return prisma.$transaction(async (tx) => {
    await getAuthorizedAthleteTeam(tx, actorId, athleteId);
    const override = await tx.athleteWeeklyRequirementOverride.upsert({
      where: {
        athleteId_weekStartAt: {
          athleteId,
          weekStartAt: normalizedWeekStartAt,
        },
      },
      update: { requiredMinutes, reason, createdBy: actorId },
      create: {
        athleteId,
        weekStartAt: normalizedWeekStartAt,
        requiredMinutes,
        reason,
        createdBy: actorId,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        entityType: "ATHLETE_WEEKLY_REQUIREMENT_OVERRIDE",
        entityId: override.id,
        action: "UPSERT",
        after: toInputJsonValue(override),
      },
    });
    return override;
  });
};

export const removeAthleteWeeklyRequirementOverride = async (
  actorId: string,
  overrideId: string,
) =>
  prisma.$transaction(async (tx) => {
    const override = await tx.athleteWeeklyRequirementOverride.findUnique({
      where: { id: overrideId },
    });
    if (!override) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Override not found.",
      });
    }
    await getAuthorizedAthleteTeam(tx, actorId, override.athleteId);
    await tx.athleteWeeklyRequirementOverride.delete({
      where: { id: override.id },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        entityType: "ATHLETE_WEEKLY_REQUIREMENT_OVERRIDE",
        entityId: override.id,
        action: "DELETE",
        before: toInputJsonValue(override),
      },
    });
    return { success: true };
  });

export type AthleteWeeklySettingMode = "NONE" | "WEEK" | "INDEFINITE";

export const saveAthleteWeeklySetting = async (
  actorId: string,
  input: {
    teamId: string;
    athleteId: string;
    weekStartAt: Date;
    mode: AthleteWeeklySettingMode;
    requiredMinutes: number | null;
    reason: string | null;
  },
) => {
  const weekStartAt = getWeekStartAt(input.weekStartAt);
  if (
    input.requiredMinutes !== null &&
    weekStartAt.getTime() !== getWeekStartAt(new Date()).getTime()
  ) {
    throw new Error(
      "Athlete weekly overrides can only be set for the current week.",
    );
  }

  return prisma.$transaction(async (tx) => {
    const athleteTeamId = await getAuthorizedAthleteTeam(
      tx,
      actorId,
      input.athleteId,
    );
    if (athleteTeamId !== input.teamId) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }

    const [beforeOverride, beforeExemptions] = await Promise.all([
      tx.athleteWeeklyRequirementOverride.findUnique({
        where: {
          athleteId_weekStartAt: {
            athleteId: input.athleteId,
            weekStartAt,
          },
        },
      }),
      tx.exemption.findMany({
        where: {
          athleteId: input.athleteId,
          OR: [{ weekStartAt }, { isIndefinite: true }],
        },
        orderBy: [{ weekStartAt: "asc" }, { id: "asc" }],
      }),
    ]);

    let override: typeof beforeOverride = null;
    if (input.mode === "NONE" && input.requiredMinutes !== null) {
      override = await tx.athleteWeeklyRequirementOverride.upsert({
        where: {
          athleteId_weekStartAt: {
            athleteId: input.athleteId,
            weekStartAt,
          },
        },
        update: {
          requiredMinutes: input.requiredMinutes,
          reason: input.reason,
          createdBy: actorId,
        },
        create: {
          athleteId: input.athleteId,
          weekStartAt,
          requiredMinutes: input.requiredMinutes,
          reason: input.reason,
          createdBy: actorId,
        },
      });
    } else {
      await tx.athleteWeeklyRequirementOverride.deleteMany({
        where: { athleteId: input.athleteId, weekStartAt },
      });
    }

    await tx.exemption.deleteMany({
      where: {
        athleteId: input.athleteId,
        OR: [{ weekStartAt }, { isIndefinite: true }],
      },
    });

    const exemption =
      input.mode === "NONE"
        ? null
        : await tx.exemption.create({
            data: {
              athleteId: input.athleteId,
              weekStartAt,
              reason: input.reason,
              isIndefinite: input.mode === "INDEFINITE",
              createdBy: actorId,
            },
          });

    await tx.auditLog.create({
      data: {
        actorId,
        entityType: "ATHLETE_WEEKLY_SETTING",
        entityId: input.athleteId,
        action: "REPLACE",
        before: toInputJsonValue({
          override: beforeOverride,
          exemptions: beforeExemptions,
        }),
        after: toInputJsonValue({ override, exemption }),
      },
    });

    return { override, exemption };
  });
};
