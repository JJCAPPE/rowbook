import { WeeklyStatus, getWeekRange } from "@rowbook/shared";
import { getTeamIdForAthlete } from "@/server/repositories/users";
import { listEntriesByAthleteWeek } from "@/server/repositories/training-entries";
import { getWeeklyRequirement } from "@/server/repositories/weekly-requirements";
import { getExemption } from "@/server/repositories/exemptions";
import { getWeeklyAggregate, listWeeklyAggregatesByAthlete } from "@/server/repositories/weekly-aggregates";

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
