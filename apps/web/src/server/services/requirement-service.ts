import { getWeekEndAt } from "@rowbook/shared";
import { upsertWeeklyRequirement } from "@/server/repositories/weekly-requirements";
import { upsertExemption } from "@/server/repositories/exemptions";
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
) => {
  const exemption = await upsertExemption({
    athleteId,
    weekStartAt,
    reason,
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
