import {
  ActivityType,
  PENDING_PROOF_STATUSES,
  ValidationStatus,
  WeeklyStatus,
  getWeekEndAt,
} from "@rowbook/shared";
import { listTeamAthletes } from "@/server/repositories/users";
import { listEntriesByTeamWeek } from "@/server/repositories/training-entries";
import { getWeeklyRequirement } from "@/server/repositories/weekly-requirements";
import { listExemptionsByWeek } from "@/server/repositories/exemptions";
import {
  listWeeklyAggregatesByTeamWeekWithAthlete,
  upsertWeeklyAggregate,
} from "@/server/repositories/weekly-aggregates";

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
