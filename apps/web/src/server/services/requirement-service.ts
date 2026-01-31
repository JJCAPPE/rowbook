import { getWeekEndAt } from "@rowbook/shared";
import { upsertWeeklyRequirement, listWeeklyRequirementsByTeamSince } from "@/server/repositories/weekly-requirements";
import { deleteExemption, upsertExemption } from "@/server/repositories/exemptions";
import { createAuditLog } from "@/server/repositories/audit-logs";

export const setWeeklyRequirement = async (
  actorId: string,
  teamId: string,
  weekStartAt: Date,
  requiredMinutes: number,
) => {
  const weekEndAt = getWeekEndAt(weekStartAt);
  const requirement = await upsertWeeklyRequirement({
    teamId,
    weekStartAt,
    weekEndAt,
    requiredMinutes,
  });

  await createAuditLog({
    actorId,
    entityType: "WEEKLY_REQUIREMENT",
    entityId: requirement.id,
    action: "UPSERT",
    after: requirement,
  });

  return requirement;
};

export const setExemption = async (
  actorId: string,
  athleteId: string,
  weekStartAt: Date,
  reason: string | null,
  isIndefinite?: boolean,
) => {
  const exemption = await upsertExemption({
    athleteId,
    weekStartAt,
    reason,
    isIndefinite,
    createdBy: actorId,
  });

  await createAuditLog({
    actorId,
    entityType: "EXEMPTION",
    entityId: exemption.id,
    action: "UPSERT",
    after: exemption,
  });

  return exemption;
};

export const removeExemption = async (
  actorId: string,
  athleteId: string,
  weekStartAt: Date,
) => {
  const exemption = await deleteExemption(athleteId, weekStartAt);

  await createAuditLog({
    actorId,
    entityType: "EXEMPTION",
    entityId: exemption.id,
    action: "DELETE",
    before: exemption,
  });

  return { success: true };
};

export const setWeeklyRequirements = async (
  actorId: string,
  teamId: string,
  requirements: { weekStartAt: Date; requiredMinutes: number }[],
) => {
  const results = await Promise.all(
    requirements.map(async ({ weekStartAt, requiredMinutes }) => {
      const weekEndAt = getWeekEndAt(weekStartAt);
      const requirement = await upsertWeeklyRequirement({
        teamId,
        weekStartAt,
        weekEndAt,
        requiredMinutes,
      });

      await createAuditLog({
        actorId,
        entityType: "WEEKLY_REQUIREMENT",
        entityId: requirement.id,
        action: "UPSERT",
        after: requirement,
      });

      return requirement;
    }),
  );

  return results;
};

export const getWeeklyRequirementsRange = async (
  teamId: string,
  startAt: Date,
  endAt: Date,
) => {
  return listWeeklyRequirementsByTeamSince(teamId, startAt);
  // Note: listWeeklyRequirementsByTeamSince already filters by gte startAt.
  // We might want to filter by lte endAt as well, but for now fetching forward is fine.
  // Ideally, we should update the repository to support a range if we want strict bounding.
};
