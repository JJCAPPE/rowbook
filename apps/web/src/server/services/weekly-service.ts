import { ActivityType, WeeklyStatus, getWeekEndAt } from "@rowbook/shared";
import { listTeamAthletes } from "@/server/repositories/users";
import { listEntriesByTeamWeek } from "@/server/repositories/training-entries";
import { getWeeklyRequirement } from "@/server/repositories/weekly-requirements";
import { listExemptionsByWeek } from "@/server/repositories/exemptions";
import { listWeeklyAggregatesByTeamWeek, upsertWeeklyAggregate } from "@/server/repositories/weekly-aggregates";

const computeAggregate = (entries: Array<{
  athleteId: string;
  activityType: ActivityType;
  minutes: number;
  avgHr: number | null;
}>) => {
  const totals = new Map<
    string,
    { totalMinutes: number; activityTypes: Set<ActivityType>; hasHrData: boolean }
  >();

  for (const entry of entries) {
    const current =
      totals.get(entry.athleteId) ?? {
        totalMinutes: 0,
        activityTypes: new Set<ActivityType>(),
        hasHrData: false,
      };
    current.totalMinutes += entry.minutes;
    current.activityTypes.add(entry.activityType);
    if (entry.avgHr !== null && entry.avgHr !== undefined) {
      current.hasHrData = true;
    }
    totals.set(entry.athleteId, current);
  }

  return totals;
};

export const aggregateWeekForTeam = async (teamId: string, weekStartAt: Date) => {
  const weekEndAt = getWeekEndAt(weekStartAt);
  const [athletes, entries, requirement, exemptions] = await Promise.all([
    listTeamAthletes(teamId),
    listEntriesByTeamWeek(teamId, weekStartAt),
    getWeeklyRequirement(teamId, weekStartAt),
    listExemptionsByWeek(weekStartAt, teamId),
  ]);

  const exemptionsSet = new Set(exemptions.map((exemption) => exemption.athleteId));
  const totals = computeAggregate(entries);
  const requiredMinutes = requirement?.requiredMinutes ?? 0;

  const aggregates = [];

  for (const athlete of athletes) {
    const athleteTotals = totals.get(athlete.id) ?? {
      totalMinutes: 0,
      activityTypes: new Set<ActivityType>(),
      hasHrData: false,
    };

    const status: WeeklyStatus = exemptionsSet.has(athlete.id)
      ? "EXEMPT"
      : athleteTotals.totalMinutes >= requiredMinutes
        ? "MET"
        : "NOT_MET";

    const aggregate = await upsertWeeklyAggregate({
      athleteId: athlete.id,
      teamId,
      weekStartAt,
      weekEndAt,
      totalMinutes: athleteTotals.totalMinutes,
      activityTypes: Array.from(athleteTotals.activityTypes),
      hasHrData: athleteTotals.hasHrData,
      status,
    });

    aggregates.push(aggregate);
  }

  return aggregates;
};

export const getLeaderboardForWeek = async (teamId: string, weekStartAt: Date) => {
  const aggregates = await listWeeklyAggregatesByTeamWeek(teamId, weekStartAt);
  if (aggregates.length > 0) {
    return aggregates;
  }

  return aggregateWeekForTeam(teamId, weekStartAt);
};
