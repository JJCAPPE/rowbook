import { getPreviousWeekStartAt, getWeekEndAt, getWeekRange, ValidationStatus, nowInZone } from "@rowbook/shared";
import type { ActivityType, TrainingEntry, WeeklyStatus } from "@rowbook/shared";
import { getTeamIdForAthlete } from "@/server/repositories/users";
import { listEntriesByAthleteSinceWeekStart, listEntriesByAthleteWeek } from "@/server/repositories/training-entries";
import { getWeeklyRequirement, listWeeklyRequirementsByTeamSince } from "@/server/repositories/weekly-requirements";
import { getExemption, listExemptionsByAthleteSince } from "@/server/repositories/exemptions";
import { getWeeklyAggregate, listWeeklyAggregatesByAthlete } from "@/server/repositories/weekly-aggregates";
import { getProofViewUrl } from "@/server/services/proof-service";
import { getTeamLeaderboard, getTeamStats, getTeamTrend } from "@/server/services/weekly-service";
import { getWeightedAvgHr } from "@/server/utils/heart-rate";

const attachProofs = async <T extends { proofImages: Array<{ id: string; extractedFields: any }> }>(
  entries: T[],
  athleteId: string,
): Promise<Array<T & { proofs: Array<{ id: string; url: string; extractedFields: any }> }>> =>
  Promise.all(
    entries.map(async (entry) => {
      const proofs = await Promise.all(
        entry.proofImages.map(async (proof) => {
          try {
            const view = await getProofViewUrl(athleteId, proof.id, false);
            return { id: proof.id, url: view.signedUrl, extractedFields: proof.extractedFields };
          } catch {
            return { id: proof.id, url: "", extractedFields: proof.extractedFields };
          }
        })
      );
      // Filter out failed URLs if needed, or keep empty string to indicate error
      return { ...entry, proofs };
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
    weekStartAt ?? nowInZone(),
  );

  const [entries, requirement, exemption, aggregate] = await Promise.all([
    listEntriesByAthleteWeek(athleteId, normalizedWeekStart, weekEndAt),
    getWeeklyRequirement(teamId, normalizedWeekStart, weekEndAt),
    getExemption(athleteId, normalizedWeekStart, weekEndAt),
    getWeeklyAggregate(athleteId, normalizedWeekStart, weekEndAt),
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
      
  const entriesWithProofs = await attachProofs(entries as any[], athleteId);

  return {
    weekStartAt: normalizedWeekStart,
    weekEndAt,
    requiredMinutes,
    totalMinutes: totals.totalMinutes,
    hasHrData: totals.hasHrData,
    avgHr,
    status,
    entries: entriesWithProofs.map(e => ({
      ...e,
      proofs: e.proofs,
      // Legacy support for frontend transition (using first proof)
      extractedFields: e.proofs[0]?.extractedFields ?? null,
      proofUrl: e.proofs[0]?.url ?? null,
    })),
  };
};

export const getAthleteHistory = async (athleteId: string) => {
  const [history, teamId] = await Promise.all([
    listWeeklyAggregatesByAthlete(athleteId),
    getTeamIdForAthlete(athleteId),
  ]);
  
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

  // Group entries by week for robust HR calculation
  const entriesByWeek = new Map<string, typeof entries>();
  for (const entry of entries) {
    if (entry.validationStatus === "REJECTED") continue;
    const key = entry.weekStartAt.toISOString();
    const list = entriesByWeek.get(key) ?? [];
    list.push(entry);
    entriesByWeek.set(key, list);
  }

  // Deduplicate weekly aggregates by week range key to handle cases where
  // weekStartAt timestamps differ slightly but represent the same week
  const weekMap = new Map<string, {
    athleteId: string;
    weekStartAt: Date;
    weekEndAt: Date;
    totalMinutes: number;
    activityTypes: any[];
    hasHrData: boolean;
    status: any;
    avgHr: number | null;
  }>();

  for (const week of history) {
    const weekKey = week.weekStartAt.toISOString();
    const existing = weekMap.get(weekKey);
    
    // Calculate avgHr for this normalized week from entries
    const entriesForWeek = entriesByWeek.get(weekKey) ?? [];
    const entriesAvgHr = entriesForWeek.length > 0 
      ? getWeightedAvgHr(entriesForWeek.map(e => ({ minutes: e.minutes, avgHr: e.avgHr })))
      : null;

    if (existing) {
      // Merge: sum minutes
      existing.totalMinutes += week.totalMinutes;
      // avgHr is constant for the weekKey
    } else {
      weekMap.set(weekKey, {
        athleteId: week.athleteId,
        weekStartAt: week.weekStartAt,
        weekEndAt: week.weekEndAt,
        totalMinutes: week.totalMinutes,
        activityTypes: week.activityTypes,
        hasHrData: week.hasHrData,
        status: week.status,
        avgHr: entriesAvgHr,
      });
    }
  }

  // Convert map back to array and compute final avgHr
  return Array.from(weekMap.values())
    .map((week) => ({
      athleteId: week.athleteId,
      weekStartAt: week.weekStartAt,
      weekEndAt: week.weekEndAt,
      totalMinutes: week.totalMinutes,
      activityTypes: week.activityTypes,
      hasHrData: week.hasHrData,
      status: week.status,
      avgHr: week.avgHr,
    }))
    .sort((a, b) => b.weekStartAt.getTime() - a.weekStartAt.getTime());
};

export const getAthleteHistoryWithEntries = async (athleteId: string, weekCount = 8) => {
  const teamId = await getTeamIdForAthlete(athleteId);
  if (!teamId) {
    throw new Error("Athlete is not assigned to a team.");
  }

  const { weekStartAt: currentWeekStart } = getWeekRange(nowInZone());
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
  
  // Need to fetch proofs for all entries efficiently?
  // attachProofs already takes an array. 
  // We can just process on the fly or flat map.
  // Actually, getAthleteHistoryWithEntries groups by week.
  // It returns entries. 
  
  // The 'entries' variable contains all entries found.
  // We should attach proofs to ALL of them first.
  const allEntriesWithProofs = await attachProofs(entries as any[], athleteId);
  const proofMap = new Map(allEntriesWithProofs.map(e => [e.id, e.proofs]));

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
        entries: sortedEntries.map(e => {
            const proofs = proofMap.get(e.id) ?? [];
            return {
                ...e,
                proofs,
                extractedFields: proofs[0]?.extractedFields ?? null,
                proofUrl: proofs[0]?.url ?? null, // Legacy
            };
        }),
      };
    })
    .sort((a, b) => b.weekStartAt.getTime() - a.weekStartAt.getTime());
};

export const getAthleteWeekDetail = async (athleteId: string, weekStartAt: Date) => {
  const teamId = await getTeamIdForAthlete(athleteId);
  if (!teamId) {
    throw new Error("Athlete is not assigned to a team.");
  }

  const normalizedWeekStart = getWeekRange(weekStartAt).weekStartAt;
  const weekEndAt = getWeekEndAt(normalizedWeekStart);
  const entries = (await listEntriesByAthleteWeek(
    athleteId,
    normalizedWeekStart,
    weekEndAt,
  )) as TrainingEntry[];
  
  const entriesWithProofs = await attachProofs(entries as any[], athleteId);

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
    entries: entriesWithProofs.map(e => ({
        ...e,
        proofs: e.proofs,
        extractedFields: e.proofs[0]?.extractedFields ?? null,
        proofUrl: e.proofs[0]?.url ?? null,
    })),
  };
};

export const getAthleteLeaderboard = async (athleteId: string, weekStartAt?: Date) => {
  const teamId = await getTeamIdForAthlete(athleteId);
  if (!teamId) {
    throw new Error("Athlete is not assigned to a team.");
  }

  const week = weekStartAt 
    ? getWeekRange(weekStartAt).weekStartAt 
    : getWeekRange(nowInZone()).weekStartAt;
  const weekEndAt = getWeekEndAt(week);
  const [leaderboard, teamStats, teamTrend] = await Promise.all([
    getTeamLeaderboard(teamId, week),
    getTeamStats(teamId, week),
    getTeamTrend(teamId, week, 6),
  ]);

  return {
    teamId,
    weekStartAt: week,
    weekEndAt,
    leaderboard,
    teamStats,
    teamTrend,
  };
};
