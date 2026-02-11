import { getWeekEndAt, getWeekStartAt } from "@rowbook/shared";
import { getExemption, listExemptionsByWeek } from "@/server/repositories/exemptions";
import {
  getAthleteWeeklyRequirementOverride,
  listAthleteWeeklyRequirementOverridesByWeek,
} from "@/server/repositories/athlete-weekly-requirement-overrides";
import { getWeeklyRequirement } from "@/server/repositories/weekly-requirements";

export type WeeklyRequirementSource =
  | "TEAM_DEFAULT"
  | "ATHLETE_OVERRIDE"
  | "EXEMPT_WEEK"
  | "EXEMPT_INDEFINITE";

type ExemptionRecord = {
  id: string;
  athleteId: string;
  weekStartAt: Date;
  reason: string | null;
  isIndefinite: boolean;
};

type OverrideRecord = {
  id: string;
  athleteId: string;
  weekStartAt: Date;
  requiredMinutes: number;
  reason: string | null;
};

export type EffectiveWeeklyTarget = {
  requiredMinutes: number;
  isExempt: boolean;
  source: WeeklyRequirementSource;
  reason: string | null;
  exemptionId: string | null;
  overrideId: string | null;
};

const choosePreferredExemption = (
  existing: ExemptionRecord | undefined,
  candidate: ExemptionRecord,
): ExemptionRecord => {
  if (!existing) {
    return candidate;
  }

  if (existing.isIndefinite !== candidate.isIndefinite) {
    return existing.isIndefinite ? candidate : existing;
  }

  return existing.weekStartAt >= candidate.weekStartAt ? existing : candidate;
};

export const mapEffectiveExemptionsByAthlete = (
  exemptions: ExemptionRecord[],
): Map<string, ExemptionRecord> => {
  const map = new Map<string, ExemptionRecord>();

  for (const exemption of exemptions) {
    map.set(
      exemption.athleteId,
      choosePreferredExemption(map.get(exemption.athleteId), exemption),
    );
  }

  return map;
};

export const resolveEffectiveWeeklyTarget = (
  teamRequiredMinutes: number,
  exemption: ExemptionRecord | null | undefined,
  override: OverrideRecord | null | undefined,
): EffectiveWeeklyTarget => {
  if (exemption) {
    return {
      requiredMinutes: 0,
      isExempt: true,
      source: exemption.isIndefinite ? "EXEMPT_INDEFINITE" : "EXEMPT_WEEK",
      reason: exemption.reason,
      exemptionId: exemption.id,
      overrideId: null,
    };
  }

  if (override) {
    return {
      requiredMinutes: override.requiredMinutes,
      isExempt: false,
      source: "ATHLETE_OVERRIDE",
      reason: override.reason,
      exemptionId: null,
      overrideId: override.id,
    };
  }

  return {
    requiredMinutes: teamRequiredMinutes,
    isExempt: false,
    source: "TEAM_DEFAULT",
    reason: null,
    exemptionId: null,
    overrideId: null,
  };
};

export const getEffectiveWeeklyTarget = async (
  teamId: string,
  athleteId: string,
  weekStartAt: Date,
) => {
  const normalizedWeekStartAt = getWeekStartAt(weekStartAt);
  const weekEndAt = getWeekEndAt(normalizedWeekStartAt);

  const [requirement, exemption, override] = await Promise.all([
    getWeeklyRequirement(teamId, normalizedWeekStartAt, weekEndAt),
    getExemption(athleteId, normalizedWeekStartAt, weekEndAt),
    getAthleteWeeklyRequirementOverride(athleteId, normalizedWeekStartAt, weekEndAt),
  ]);

  const teamRequiredMinutes = requirement?.requiredMinutes ?? 0;
  const effective = resolveEffectiveWeeklyTarget(
    teamRequiredMinutes,
    (exemption as ExemptionRecord | null) ?? null,
    (override as OverrideRecord | null) ?? null,
  );

  return {
    weekStartAt: normalizedWeekStartAt,
    weekEndAt,
    teamRequiredMinutes,
    exemption: (exemption as ExemptionRecord | null) ?? null,
    override: (override as OverrideRecord | null) ?? null,
    ...effective,
  };
};

export const getEffectiveWeeklyTargetsForTeamWeek = async (
  teamId: string,
  weekStartAt: Date,
) => {
  const normalizedWeekStartAt = getWeekStartAt(weekStartAt);
  const weekEndAt = getWeekEndAt(normalizedWeekStartAt);

  const [requirement, exemptionsRaw, overridesRaw] = await Promise.all([
    getWeeklyRequirement(teamId, normalizedWeekStartAt, weekEndAt),
    listExemptionsByWeek(normalizedWeekStartAt, weekEndAt, teamId),
    listAthleteWeeklyRequirementOverridesByWeek(
      normalizedWeekStartAt,
      weekEndAt,
      teamId,
    ),
  ]);

  const teamRequiredMinutes = requirement?.requiredMinutes ?? 0;
  const exemptionsByAthlete = mapEffectiveExemptionsByAthlete(
    (exemptionsRaw as ExemptionRecord[]) ?? [],
  );
  const overridesByAthlete = new Map<string, OverrideRecord>();

  for (const override of (overridesRaw as OverrideRecord[]) ?? []) {
    overridesByAthlete.set(override.athleteId, override);
  }

  return {
    weekStartAt: normalizedWeekStartAt,
    weekEndAt,
    teamRequiredMinutes,
    exemptionsByAthlete,
    overridesByAthlete,
    resolveForAthlete: (athleteId: string) =>
      resolveEffectiveWeeklyTarget(
        teamRequiredMinutes,
        exemptionsByAthlete.get(athleteId),
        overridesByAthlete.get(athleteId),
      ),
  };
};
