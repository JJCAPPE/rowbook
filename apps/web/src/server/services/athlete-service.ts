import { getIsoWeekKey, getPreviousWeekStartAt, getWeekEndAt, getWeekRange, ValidationStatus, nowInZone } from "@rowbook/shared";
import type { ActivityType, TrainingEntry, WeeklyStatus } from "@rowbook/shared";
import { getTeamIdForAthlete } from "@/server/repositories/users";
import { getTeamById } from "@/server/repositories/teams";
import { listEntriesByAthleteSinceWeekStart, listEntriesByAthleteWeek } from "@/server/repositories/training-entries";
import { getWeeklyRequirement, listWeeklyRequirementsByTeamSince } from "@/server/repositories/weekly-requirements";
import { getExemption, listExemptionsByAthleteSince } from "@/server/repositories/exemptions";
import { getWeeklyAggregate, listWeeklyAggregatesByAthlete } from "@/server/repositories/weekly-aggregates";
import { getProofViewUrl } from "@/server/services/proof-service";
import { getTeamLeaderboard, getTeamStats, getTeamTrend } from "@/server/services/weekly-service";
import { getWeightedAvgHr, getWeightedAvgHrByWeek } from "@/server/utils/heart-rate";

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

  // Fetch team settings for week cutoff hour
  const team = await getTeamById(teamId);
  const cutoffHour = (team as any)?.weekCutoffHour ?? 18;
  const timezone = team?.timezone ?? "America/New_York";

  const { weekStartAt: normalizedWeekStart, weekEndAt } = getWeekRange(
    weekStartAt ?? nowInZone(timezone),
    timezone,
    cutoffHour,
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

  // Fetch team settings for robust week bucketing
  let cutoffHour = 18;
  let timezone = "America/New_York";
  if (teamId) {
    const team = await getTeamById(teamId);
    if (team) {
      cutoffHour = (team as any).weekCutoffHour ?? 18;
      timezone = team.timezone;
    }
  }

  const earliestWeekStart = history[history.length - 1]?.weekStartAt;
  if (!earliestWeekStart) {
    return history;
  }

  // Calculate buffer start: Earliest week start minus typical buffer to catch all relevant entries
  const bufferedStart = new Date(earliestWeekStart.getTime() - 12 * 60 * 60 * 1000);

  const entries = (await listEntriesByAthleteSinceWeekStart(
    athleteId,
    bufferedStart,
  )) as Array<{
    weekStartAt: Date;
    minutes: number;
    avgHr: number | null;
    validationStatus: ValidationStatus;
  }>;

  // Group entries by ISO week for robust HR calculation
  const entriesByIsoWeek = new Map<string, typeof entries>();
  for (const entry of entries) {
    if (entry.validationStatus === "REJECTED") continue;
    const key = getIsoWeekKey(entry.weekStartAt);
    const list = entriesByIsoWeek.get(key) ?? [];
    list.push(entry);
    entriesByIsoWeek.set(key, list);
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
    const weekKey = getIsoWeekKey(week.weekStartAt);
    const existing = weekMap.get(weekKey);
    
    // Calculate avgHr for this normalized week from entries
    const entriesForWeek = entriesByIsoWeek.get(weekKey) ?? [];
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

  // Fetch team settings for week cutoff hour
  const team = await getTeamById(teamId);
  const cutoffHour = (team as any)?.weekCutoffHour ?? 18;
  const timezone = team?.timezone ?? "America/New_York";

  const { weekStartAt: currentWeekStart } = getWeekRange(nowInZone(timezone), timezone, cutoffHour);
  let earliestWeekStart = currentWeekStart;

  for (let index = 1; index < weekCount; index += 1) {
    earliestWeekStart = getPreviousWeekStartAt(earliestWeekStart, timezone, cutoffHour);
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
    const key = getIsoWeekKey(entry.weekStartAt);
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
        weekEndAt: getWeekEndAt(weekStartAt, timezone),
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

  // Fetch team settings for week cutoff hour
  const team = await getTeamById(teamId);
  const cutoffHour = (team as any)?.weekCutoffHour ?? 18;
  const timezone = team?.timezone ?? "America/New_York";

  const normalizedWeekStart = getWeekRange(weekStartAt, timezone, cutoffHour).weekStartAt;
  const weekEndAt = getWeekEndAt(normalizedWeekStart, timezone);
  const entries = (await listEntriesByAthleteWeek(
    athleteId,
    normalizedWeekStart,
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

  // Fetch team settings for week cutoff hour
  const team = await getTeamById(teamId);
  const cutoffHour = (team as any)?.weekCutoffHour ?? 18;
  const timezone = team?.timezone ?? "America/New_York";

  const week = weekStartAt 
    ? getWeekRange(weekStartAt, timezone, cutoffHour).weekStartAt 
    : getWeekRange(nowInZone(timezone), timezone, cutoffHour).weekStartAt;
  const weekEndAt = getWeekEndAt(week, timezone);
  const [leaderboard, teamStats, teamTrend] = await Promise.all([
    getTeamLeaderboard(teamId, week, timezone, cutoffHour),
    getTeamStats(teamId, week),
    getTeamTrend(teamId, week, 6, timezone, cutoffHour),
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
