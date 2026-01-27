import { getPreviousWeekStartAt, getWeekEndAt, getWeekRange, ValidationStatus } from "@rowbook/shared";
import type { ActivityType, TrainingEntry, WeeklyStatus } from "@rowbook/shared";
import { getTeamIdForAthlete } from "@/server/repositories/users";
import { listEntriesByAthleteSinceWeekStart, listEntriesByAthleteWeek } from "@/server/repositories/training-entries";
import { getWeeklyRequirement, listWeeklyRequirementsByTeamSince } from "@/server/repositories/weekly-requirements";
import { getExemption, listExemptionsByAthleteSince } from "@/server/repositories/exemptions";
import { getWeeklyAggregate, listWeeklyAggregatesByAthlete } from "@/server/repositories/weekly-aggregates";
import { getProofViewUrl } from "@/server/services/proof-service";
import { getTeamLeaderboard } from "@/server/services/weekly-service";
import { getWeightedAvgHr, getWeightedAvgHrByWeek } from "@/server/utils/heart-rate";

const attachProofUrls = async <T extends { proofImageId: string }>(
  entries: T[],
  athleteId: string,
): Promise<Array<T & { proofUrl: string | null }>> =>
  Promise.all(
    entries.map(async (entry) => {
      try {
        const view = await getProofViewUrl(athleteId, entry.proofImageId, false);
        return { ...entry, proofUrl: view.signedUrl };
      } catch {
        return { ...entry, proofUrl: null };
      }
    }),
  );

const computeTotals = (entries: Array<{
  minutes: number;
  avgHr: number | null;
  validationStatus: ValidationStatus;
}>) => {
  let totalMinutes = 0;
  let hasHrData = false;

  for (const entry of entries) {
    if (entry.validationStatus === "REJECTED") {
      continue;
    }
    totalMinutes += entry.minutes;
    if (entry.avgHr !== null && entry.avgHr !== undefined) {
      hasHrData = true;
    }
  }

  return { totalMinutes, hasHrData };
};

export const getAthleteDashboard = async (athleteId: string, weekStartAt?: Date) => {
  const teamId = await getTeamIdForAthlete(athleteId);
  if (!teamId) {
    throw new Error("Athlete is not assigned to a team.");
  }

  const { weekStartAt: normalizedWeekStart, weekEndAt } = getWeekRange(
    weekStartAt ?? new Date(),
  );

  const [entries, requirement, exemption, aggregate] = await Promise.all([
    listEntriesByAthleteWeek(athleteId, normalizedWeekStart),
    getWeeklyRequirement(teamId, normalizedWeekStart),
    getExemption(athleteId, normalizedWeekStart),
    getWeeklyAggregate(athleteId, normalizedWeekStart),
  ]);

  const totals = aggregate ?? computeTotals(entries);
  const avgHr = getWeightedAvgHr(
    entries.filter((entry) => entry.validationStatus !== "REJECTED"),
  );
  const requiredMinutes = requirement?.requiredMinutes ?? 0;
  const status: WeeklyStatus = exemption
    ? "EXEMPT"
    : totals.totalMinutes >= requiredMinutes
      ? "MET"
      : "NOT_MET";

  return {
    weekStartAt: normalizedWeekStart,
    weekEndAt,
    requiredMinutes,
    totalMinutes: totals.totalMinutes,
    hasHrData: totals.hasHrData,
    avgHr,
    status,
    entries,
  };
};

export const getAthleteHistory = async (athleteId: string) => {
  const history = await listWeeklyAggregatesByAthlete(athleteId);
  if (!history.length) {
    return history;
  }

  const earliestWeekStart = history[history.length - 1]?.weekStartAt;
  if (!earliestWeekStart) {
    return history;
  }

  const entries = (await listEntriesByAthleteSinceWeekStart(
    athleteId,
    earliestWeekStart,
  )) as Array<{
    weekStartAt: Date;
    minutes: number;
    avgHr: number | null;
    validationStatus: ValidationStatus;
  }>;

  const avgHrByWeek = getWeightedAvgHrByWeek(entries);

  return history.map((week) => ({
    ...week,
    avgHr: avgHrByWeek.get(week.weekStartAt.toISOString()) ?? null,
  }));
};

export const getAthleteHistoryWithEntries = async (athleteId: string, weekCount = 8) => {
  const teamId = await getTeamIdForAthlete(athleteId);
  if (!teamId) {
    throw new Error("Athlete is not assigned to a team.");
  }

  const { weekStartAt: currentWeekStart } = getWeekRange(new Date());
  let earliestWeekStart = currentWeekStart;

  for (let index = 1; index < weekCount; index += 1) {
    earliestWeekStart = getPreviousWeekStartAt(earliestWeekStart);
  }

  const [entriesResult, requirementsResult, exemptionsResult] = await Promise.all([
    listEntriesByAthleteSinceWeekStart(athleteId, earliestWeekStart),
    listWeeklyRequirementsByTeamSince(teamId, earliestWeekStart),
    listExemptionsByAthleteSince(athleteId, earliestWeekStart),
  ]);

  const entries = entriesResult as TrainingEntry[];
  const requirementsByWeek = new Map(
    requirementsResult.map((requirement) => [
      requirement.weekStartAt.toISOString(),
      requirement.requiredMinutes,
    ]),
  );
  const exemptionsByWeek = new Set(
    exemptionsResult.map((exemption) => exemption.weekStartAt.toISOString()),
  );

  const weeksByKey = new Map<string, { weekStartAt: Date; entries: TrainingEntry[] }>();

  for (const entry of entries) {
    const key = entry.weekStartAt.toISOString();
    const current = weeksByKey.get(key);
    if (current) {
      current.entries.push(entry);
    } else {
      weeksByKey.set(key, { weekStartAt: entry.weekStartAt, entries: [entry] });
    }
  }

  return Array.from(weeksByKey.values())
    .map(({ weekStartAt, entries: weekEntries }) => {
      const activityTypes = new Set<ActivityType>();
      let totalMinutes = 0;
      let hasHrData = false;

      for (const entry of weekEntries) {
        if (entry.validationStatus === "REJECTED") {
          continue;
        }
        totalMinutes += entry.minutes;
        activityTypes.add(entry.activityType);
        if (entry.avgHr !== null && entry.avgHr !== undefined) {
          hasHrData = true;
        }
      }

      const weekKey = weekStartAt.toISOString();
      const requiredMinutes = requirementsByWeek.get(weekKey) ?? 0;
      const status: WeeklyStatus = exemptionsByWeek.has(weekKey)
        ? "EXEMPT"
        : totalMinutes >= requiredMinutes
          ? "MET"
          : "NOT_MET";

      const sortedEntries = [...weekEntries].sort(
        (a, b) => b.date.getTime() - a.date.getTime(),
      );

      return {
        weekStartAt,
        weekEndAt: getWeekEndAt(weekStartAt),
        totalMinutes,
        status,
        hasHrData,
        activityTypes: Array.from(activityTypes),
        entries: sortedEntries,
      };
    })
    .sort((a, b) => b.weekStartAt.getTime() - a.weekStartAt.getTime());
};

export const getAthleteWeekDetail = async (athleteId: string, weekStartAt: Date) => {
  const normalizedWeekStart = getWeekRange(weekStartAt).weekStartAt;
  const weekEndAt = getWeekEndAt(normalizedWeekStart);
  const entries = (await listEntriesByAthleteWeek(
    athleteId,
    normalizedWeekStart,
  )) as TrainingEntry[];
  const entriesWithProof = await attachProofUrls(entries, athleteId);

  const totalMinutes = entries.reduce(
    (sum, entry) => (entry.validationStatus === "REJECTED" ? sum : sum + entry.minutes),
    0,
  );
  const totalDistanceKm = entries.reduce(
    (sum, entry) => (entry.validationStatus === "REJECTED" ? sum : sum + entry.distance),
    0,
  );
  const countedEntries = entries.filter((entry) => entry.validationStatus !== "REJECTED");

  return {
    weekStartAt: normalizedWeekStart,
    weekEndAt,
    totalMinutes,
    totalDistanceKm,
    sessions: countedEntries.length,
    entries: entriesWithProof,
  };
};

export const getAthleteLeaderboard = async (athleteId: string, weekStartAt?: Date) => {
  const teamId = await getTeamIdForAthlete(athleteId);
  if (!teamId) {
    throw new Error("Athlete is not assigned to a team.");
  }

  const week = weekStartAt ? getWeekRange(weekStartAt).weekStartAt : getWeekRange(new Date()).weekStartAt;
  const weekEndAt = getWeekEndAt(week);
  const leaderboard = await getTeamLeaderboard(teamId, week);

  return {
    teamId,
    weekStartAt: week,
    weekEndAt,
    leaderboard,
  };
};
