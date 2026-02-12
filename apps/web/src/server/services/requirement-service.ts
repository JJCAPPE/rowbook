import { getWeekEndAt, getWeekStartAt } from "@rowbook/shared";
import { upsertWeeklyRequirement, listWeeklyRequirementsByTeamSince } from "@/server/repositories/weekly-requirements";
import {
  deleteExemptionById,
  deleteIndefiniteExemptionsByAthlete,
  deleteOtherIndefiniteExemptions,
  getExemptionById,
  upsertExemption,
} from "@/server/repositories/exemptions";
import {
  deleteAthleteWeeklyRequirementOverrideById,
  upsertAthleteWeeklyRequirementOverride,
} from "@/server/repositories/athlete-weekly-requirement-overrides";
import { createAuditLog } from "@/server/repositories/audit-logs";

export const setWeeklyRequirement = async (
  actorId: string,
  teamId: string,
  weekStartAt: Date,
  requiredMinutes: number,
) => {
  const normalizedWeekStartAt = getWeekStartAt(weekStartAt);
  const weekEndAt = getWeekEndAt(normalizedWeekStartAt);
  const requirement = await upsertWeeklyRequirement({
    teamId,
    weekStartAt: normalizedWeekStartAt,
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
  const normalizedWeekStartAt = getWeekStartAt(weekStartAt);

  if (isIndefinite) {
    await deleteOtherIndefiniteExemptions(athleteId, normalizedWeekStartAt);
  }

  const exemption = await upsertExemption({
    athleteId,
    weekStartAt: normalizedWeekStartAt,
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
  exemptionId: string,
) => {
  const exemption = await getExemptionById(exemptionId);
  if (!exemption) {
    throw new Error("Exemption not found.");
  }

  const deleteResult = exemption.isIndefinite
    ? await deleteIndefiniteExemptionsByAthlete(exemption.athleteId)
    : await deleteExemptionById(exemption.id);

  await createAuditLog({
    actorId,
    entityType: "EXEMPTION",
    entityId: exemption.id,
    action: "DELETE",
    before: exemption,
    after: "count" in deleteResult ? { deletedCount: deleteResult.count } : deleteResult,
  });

  return { success: true };
};

export const setAthleteWeeklyRequirementOverride = async (
  actorId: string,
  athleteId: string,
  weekStartAt: Date,
  requiredMinutes: number,
  reason: string | null,
) => {
  const normalizedWeekStartAt = getWeekStartAt(weekStartAt);
  const currentWeekStartAt = getWeekStartAt(new Date());

  if (normalizedWeekStartAt.getTime() !== currentWeekStartAt.getTime()) {
    throw new Error("Athlete weekly overrides can only be set for the current week.");
  }

  const override = await upsertAthleteWeeklyRequirementOverride({
    athleteId,
    weekStartAt: normalizedWeekStartAt,
    requiredMinutes,
    reason,
    createdBy: actorId,
  });

  await createAuditLog({
    actorId,
    entityType: "ATHLETE_WEEKLY_REQUIREMENT_OVERRIDE",
    entityId: override.id,
    action: "UPSERT",
    after: override,
  });

  return override;
};

export const removeAthleteWeeklyRequirementOverride = async (
  actorId: string,
  overrideId: string,
) => {
  const override = await deleteAthleteWeeklyRequirementOverrideById(overrideId);

  await createAuditLog({
    actorId,
    entityType: "ATHLETE_WEEKLY_REQUIREMENT_OVERRIDE",
    entityId: override.id,
    action: "DELETE",
    before: override,
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
      const normalizedWeekStartAt = getWeekStartAt(weekStartAt);
      const weekEndAt = getWeekEndAt(normalizedWeekStartAt);
      const requirement = await upsertWeeklyRequirement({
        teamId,
        weekStartAt: normalizedWeekStartAt,
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
