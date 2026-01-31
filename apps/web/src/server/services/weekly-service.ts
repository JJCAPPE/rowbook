import {
  ActivityType,
  PENDING_PROOF_STATUSES,
  ValidationStatus,
  WeeklyStatus,
  getPreviousWeekStartAt,
  getWeekEndAt,
} from "@rowbook/shared";
import { getWeightedAvgHr } from "@/server/utils/heart-rate";
import { listTeamAthletes } from "@/server/repositories/users";
import {
  listEntriesByAthleteWeek,
  listEntriesByTeamSinceWeekStart,
  listEntriesByTeamWeek,
} from "@/server/repositories/training-entries";
import { getWeeklyRequirement } from "@/server/repositories/weekly-requirements";
import { getExemption, listExemptionsByWeek } from "@/server/repositories/exemptions";
import {
  listWeeklyAggregatesByTeamWeekWithAthlete,
  upsertWeeklyAggregate,
} from "@/server/repositories/weekly-aggregates";

const computeAggregate = (entries: Array<{
  athleteId: string;
  activityType: ActivityType;
  minutes: number;
  avgHr: number | null;
  validationStatus: ValidationStatus;
}>) => {
  const totals = new Map<
    string,
    { totalMinutes: number; activityTypes: Set<ActivityType>; hasHrData: boolean }
  >();

  for (const entry of entries) {
    if (entry.validationStatus === "REJECTED") {
      continue;
    }
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
  const [athletes, entriesResult, requirement, exemptionsResult] = await Promise.all([
    listTeamAthletes(teamId),
    listEntriesByTeamWeek(teamId, weekStartAt),
    getWeeklyRequirement(teamId, weekStartAt),
    listExemptionsByWeek(weekStartAt, teamId),
  ]);
  const entries = entriesResult as Array<{
    athleteId: string;
    activityType: ActivityType;
    minutes: number;
    avgHr: number | null;
    validationStatus: ValidationStatus;
  }>;
  const exemptions = exemptionsResult as Array<{ athleteId: string }>;

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

export const aggregateWeekForAthlete = async (teamId: string, athleteId: string, weekStartAt: Date) => {
  const weekEndAt = getWeekEndAt(weekStartAt);
  const [entries, requirement, exemption] = await Promise.all([
    listEntriesByAthleteWeek(athleteId, weekStartAt),
    getWeeklyRequirement(teamId, weekStartAt),
    getExemption(athleteId, weekStartAt),
  ]);

  let totalMinutes = 0;
  const activityTypes = new Set<ActivityType>();
  let hasHrData = false;

  for (const entry of entries) {
    if (entry.validationStatus === "REJECTED") {
      continue;
    }
    totalMinutes += entry.minutes;
    activityTypes.add(entry.activityType);
    if (entry.avgHr !== null && entry.avgHr !== undefined) {
      hasHrData = true;
    }
  }

  const requiredMinutes = requirement?.requiredMinutes ?? 0;
  
  const status: WeeklyStatus = exemption
    ? "EXEMPT"
    : totalMinutes >= requiredMinutes
      ? "MET"
      : "NOT_MET";

  return upsertWeeklyAggregate({
    athleteId,
    teamId,
    weekStartAt,
    weekEndAt,
    totalMinutes,
    activityTypes: Array.from(activityTypes),
    hasHrData,
    status,
  });
};

export const getLeaderboardForWeek = async (teamId: string, weekStartAt: Date) => {
  const aggregates = await listWeeklyAggregatesByTeamWeekWithAthlete(teamId, weekStartAt);
  if (aggregates.length > 0) {
    return aggregates;
  }

  await aggregateWeekForTeam(teamId, weekStartAt);
  return listWeeklyAggregatesByTeamWeekWithAthlete(teamId, weekStartAt);
};

export const getTeamLeaderboard = async (teamId: string, weekStartAt: Date) => {
  const [aggregatesResult, entriesResult, requirement, exemptionsResult] = await Promise.all([
    getLeaderboardForWeek(teamId, weekStartAt),
    listEntriesByTeamWeek(teamId, weekStartAt),
    getWeeklyRequirement(teamId, weekStartAt),
    listExemptionsByWeek(weekStartAt, teamId),
  ]);
  const aggregates = aggregatesResult as Array<{
    athleteId: string;
    totalMinutes: number;
    status: WeeklyStatus;
    activityTypes: ActivityType[];
    hasHrData: boolean;
    athlete: { name: string | null; email: string };
  }>;
  const entries = entriesResult as Array<{
    athleteId: string;
    validationStatus: ValidationStatus;
  }>;
  const exemptions = exemptionsResult as Array<{ athleteId: string }>;
  const exemptionsSet = new Set(exemptions.map((exemption) => exemption.athleteId));

  const entriesByAthlete = new Map<string, typeof entries>();
  for (const entry of entries) {
    const athleteEntries = entriesByAthlete.get(entry.athleteId) ?? [];
    athleteEntries.push(entry);
    entriesByAthlete.set(entry.athleteId, athleteEntries);
  }

  const requiredMinutes = requirement?.requiredMinutes ?? 0;

  return aggregates.map((aggregate) => {
    const athleteEntries = entriesByAthlete.get(aggregate.athleteId) ?? [];
    const missingProof = athleteEntries.some(
      (entry) => entry.validationStatus === "REJECTED",
    );
    const pendingProof = athleteEntries.some((entry) =>
      PENDING_PROOF_STATUSES.has(entry.validationStatus),
    );
    const status: WeeklyStatus = exemptionsSet.has(aggregate.athleteId)
      ? "EXEMPT"
      : aggregate.totalMinutes >= requiredMinutes
        ? "MET"
        : "NOT_MET";
    const missingMinutes = requiredMinutes > 0 && status === "NOT_MET";

    return {
      id: aggregate.athleteId,
      athleteId: aggregate.athleteId,
      name:
        "athlete" in aggregate
          ? aggregate.athlete?.name ?? aggregate.athlete?.email ?? "Athlete"
          : "Athlete",
      totalMinutes: aggregate.totalMinutes,
      status,
      activityTypes: aggregate.activityTypes,
      hasHr: aggregate.hasHrData,
      missingProof,
      pendingProof,
      missingMinutes,
    };
  });
};

export const getTeamStats = async (teamId: string, weekStartAt: Date) => {
  const entries = await listEntriesByTeamWeek(teamId, weekStartAt);
  const validEntries = entries.filter((e) => e.validationStatus !== "REJECTED");

  const totalMinutes = validEntries.reduce((sum, e) => sum + e.minutes, 0);
  const totalDistance = validEntries.reduce((sum, e) => sum + e.distance, 0);
  const avgHr = getWeightedAvgHr(
    validEntries.map((e) => ({ minutes: e.minutes, avgHr: e.avgHr })),
  );

  return {
    totalMinutes,
    totalDistance,
    avgHr,
  };
};

export const getTeamTrend = async (
  teamId: string,
  endWeekStartAt: Date,
  weeks = 6,
) => {
  let start = endWeekStartAt;
  for (let i = 0; i < weeks - 1; i++) {
    start = getPreviousWeekStartAt(start);
  }

  const entries = await listEntriesByTeamSinceWeekStart(teamId, start);
  const validEntries = entries.filter(
    (e) => e.validationStatus !== "REJECTED" && e.weekStartAt <= endWeekStartAt,
  );

  const weeksMap = new Map<
    string,
    {
      minutes: number;
      distance: number;
      hrEntries: { minutes: number; avgHr: number | null }[];
    }
  >();

  let loopWeek = start;
  // Safety break to prevent infinite loops if date math is wrong
  let safety = 0;
  while (loopWeek <= endWeekStartAt && safety < 100) {
    weeksMap.set(loopWeek.toISOString(), {
      minutes: 0,
      distance: 0,
      hrEntries: [],
    });
    const next = new Date(loopWeek);
    next.setDate(next.getDate() + 7);
    loopWeek = next;
    safety++;
  }

  for (const entry of validEntries) {
    const key = entry.weekStartAt.toISOString();
    const current = weeksMap.get(key);
    if (current) {
      current.minutes += entry.minutes;
      current.distance += entry.distance;
      if (entry.avgHr !== null && entry.avgHr !== undefined) {
        current.hrEntries.push({ minutes: entry.minutes, avgHr: entry.avgHr });
      }
    }
  }

  const trend = [];
  let cumulativeMinutes = 0;
  let cumulativeDistance = 0;

  const sortedKeys = Array.from(weeksMap.keys()).sort();

  for (const key of sortedKeys) {
    const data = weeksMap.get(key)!;
    cumulativeMinutes += data.minutes;
    cumulativeDistance += data.distance;

    trend.push({
      weekStartAt: new Date(key),
      minutes: cumulativeMinutes,
      distance: cumulativeDistance,
      avgHr: getWeightedAvgHr(data.hrEntries),
    });
  }

  return trend;
};
