import { WeeklyStatus, getWeekEndAt, getWeekRange } from "@rowbook/shared";
import type { TrainingEntry } from "@rowbook/shared";
import { getTeamIdForAthlete } from "@/server/repositories/users";
import { listEntriesByAthleteWeek } from "@/server/repositories/training-entries";
import { getWeeklyRequirement } from "@/server/repositories/weekly-requirements";
import { getExemption } from "@/server/repositories/exemptions";
import { getWeeklyAggregate, listWeeklyAggregatesByAthlete } from "@/server/repositories/weekly-aggregates";
import { getProofViewUrl } from "@/server/services/proof-service";
import { getTeamLeaderboard } from "@/server/services/weekly-service";

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

const computeTotals = (entries: Array<{ minutes: number; avgHr: number | null }>) => {
  let totalMinutes = 0;
  let hasHrData = false;

  for (const entry of entries) {
    totalMinutes += entry.minutes;
    if (entry.avgHr !== null && entry.avgHr !== undefined) {
      hasHrData = true;
    }
  }

  return { totalMinutes, hasHrData };
};

export const getAthleteDashboard = async (athleteId: string) => {
  const teamId = await getTeamIdForAthlete(athleteId);
  if (!teamId) {
    throw new Error("Athlete is not assigned to a team.");
  }

  const { weekStartAt, weekEndAt } = getWeekRange(new Date());

  const [entries, requirement, exemption, aggregate] = await Promise.all([
    listEntriesByAthleteWeek(athleteId, weekStartAt),
    getWeeklyRequirement(teamId, weekStartAt),
    getExemption(athleteId, weekStartAt),
    getWeeklyAggregate(athleteId, weekStartAt),
  ]);

  const totals = aggregate ?? computeTotals(entries);
  const requiredMinutes = requirement?.requiredMinutes ?? 0;
  const status: WeeklyStatus = exemption
    ? "EXEMPT"
    : totals.totalMinutes >= requiredMinutes
      ? "MET"
      : "NOT_MET";

  return {
    weekStartAt,
    weekEndAt,
    requiredMinutes,
    totalMinutes: totals.totalMinutes,
    hasHrData: totals.hasHrData,
    status,
    entries,
  };
};

export const getAthleteHistory = async (athleteId: string) =>
  listWeeklyAggregatesByAthlete(athleteId);

export const getAthleteWeekDetail = async (athleteId: string, weekStartAt: Date) => {
  const normalizedWeekStart = getWeekRange(weekStartAt).weekStartAt;
  const weekEndAt = getWeekEndAt(normalizedWeekStart);
  const entries = (await listEntriesByAthleteWeek(
    athleteId,
    normalizedWeekStart,
  )) as TrainingEntry[];
  const entriesWithProof = await attachProofUrls(entries, athleteId);

  const totalMinutes = entries.reduce((sum, entry) => sum + entry.minutes, 0);
  const totalDistanceKm = entries.reduce((sum, entry) => sum + entry.distance, 0);

  return {
    weekStartAt: normalizedWeekStart,
    weekEndAt,
    totalMinutes,
    totalDistanceKm,
    sessions: entries.length,
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
