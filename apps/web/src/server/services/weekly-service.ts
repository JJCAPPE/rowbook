import {
  ActivityType,
  PENDING_PROOF_STATUSES,
  WeeklyStatus,
  getPreviousWeekStartAt,
  getWeekStartAt,
  getWeekEndAt,
} from "@rowbook/shared";
import { prisma } from "@/db/client";
import { getWeightedAvgHr } from "@/server/utils/heart-rate";
import { listTeamAthletes } from "@/server/repositories/users";
import {
  listEntriesByTeamSinceWeekStart,
  listEntriesByTeamWeek,
} from "@/server/repositories/training-entries";
import {
  getEffectiveWeeklyTarget,
  getEffectiveWeeklyTargetsForTeamWeek,
} from "@/server/services/weekly-target-service";

type TeamWeekEntry = Awaited<ReturnType<typeof listEntriesByTeamWeek>>[number];

type WeekEntrySummary = {
  totalMinutes: number;
  totalDistance: number;
  activityTypes: ActivityType[];
  hasHrData: boolean;
  avgHr: number | null;
  missingProof: boolean;
  pendingProof: boolean;
};

const EMPTY_WEEK_ENTRY_SUMMARY: WeekEntrySummary = {
  totalMinutes: 0,
  totalDistance: 0,
  activityTypes: [],
  hasHrData: false,
  avgHr: null,
  missingProof: false,
  pendingProof: false,
};

const summarizeEntriesByAthlete = (entries: TeamWeekEntry[]) => {
  const entriesByAthlete = new Map<string, TeamWeekEntry[]>();
  for (const entry of entries) {
    const athleteEntries = entriesByAthlete.get(entry.athleteId) ?? [];
    athleteEntries.push(entry);
    entriesByAthlete.set(entry.athleteId, athleteEntries);
  }

  const summaries = new Map<string, WeekEntrySummary>();
  for (const [athleteId, athleteEntries] of entriesByAthlete) {
    const validEntries = athleteEntries.filter(
      (entry) => entry.validationStatus !== "REJECTED",
    );
    const activityTypes = new Set<ActivityType>();
    let totalMinutes = 0;
    let totalDistance = 0;
    let hasHrData = false;

    for (const entry of validEntries) {
      totalMinutes += entry.minutes;
      totalDistance += entry.distance;
      activityTypes.add(entry.activityType);
      if (entry.avgHr !== null) hasHrData = true;
    }

    summaries.set(athleteId, {
      totalMinutes,
      totalDistance,
      activityTypes: Array.from(activityTypes),
      hasHrData,
      avgHr: getWeightedAvgHr(validEntries),
      missingProof: athleteEntries.some(
        (entry) => entry.validationStatus === "REJECTED",
      ),
      pendingProof: athleteEntries.some((entry) =>
        PENDING_PROOF_STATUSES.has(entry.validationStatus),
      ),
    });
  }

  return summaries;
};

export const aggregateWeekForTeam = async (teamId: string, weekStartAt: Date) => {
  const athletes = await listTeamAthletes(teamId);
  const aggregates = new Array<Awaited<ReturnType<typeof aggregateWeekForAthlete>>>();
  let nextAthlete = 0;
  const workerCount = Math.min(4, athletes.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextAthlete < athletes.length) {
        const athlete = athletes[nextAthlete];
        nextAthlete += 1;
        if (athlete) {
          aggregates.push(
            await aggregateWeekForAthlete(teamId, athlete.id, weekStartAt),
          );
        }
      }
    }),
  );

  return aggregates;
};

export const aggregateWeekForAthlete = async (
  teamId: string,
  athleteId: string,
  weekStartAt: Date,
) => {
  const effectiveTarget = await getEffectiveWeeklyTarget(
    teamId,
    athleteId,
    weekStartAt,
  );
  const lockScope = effectiveTarget.weekStartAt.toISOString();

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(
        hashtext(${`rowbook-athlete:${athleteId}`}),
        hashtext(${lockScope})
      )
    `;

    const entries = await tx.trainingEntry.findMany({
      where: {
        athleteId,
        weekStartAt: {
          gte: effectiveTarget.weekStartAt,
          lt: effectiveTarget.weekEndAt,
        },
      },
      select: {
        activityType: true,
        minutes: true,
        distance: true,
        avgHr: true,
        validationStatus: true,
      },
    });

    let totalMinutes = 0;
    let totalDistance = 0;
    const activityTypes = new Set<ActivityType>();
    let hasHrData = false;

    for (const entry of entries) {
      if (entry.validationStatus === "REJECTED") continue;
      totalMinutes += entry.minutes;
      totalDistance += entry.distance;
      activityTypes.add(entry.activityType);
      if (entry.avgHr !== null) hasHrData = true;
    }

    const status: WeeklyStatus = effectiveTarget.isExempt
      ? "EXEMPT"
      : totalMinutes >= effectiveTarget.requiredMinutes
        ? "MET"
        : "NOT_MET";

    return tx.weeklyAggregate.upsert({
      where: {
        athleteId_weekStartAt: {
          athleteId,
          weekStartAt: effectiveTarget.weekStartAt,
        },
      },
      update: {
        teamId,
        weekEndAt: effectiveTarget.weekEndAt,
        totalMinutes,
        totalDistance,
        activityTypes: Array.from(activityTypes),
        hasHrData,
        status,
      },
      create: {
        athleteId,
        teamId,
        weekStartAt: effectiveTarget.weekStartAt,
        weekEndAt: effectiveTarget.weekEndAt,
        totalMinutes,
        totalDistance,
        activityTypes: Array.from(activityTypes),
        hasHrData,
        status,
      },
    });
  });
};

export const getLeaderboardForWeek = async (teamId: string, weekStartAt: Date) => {
  const normalizedWeekStartAt = getWeekStartAt(weekStartAt);
  const weekEndAt = getWeekEndAt(normalizedWeekStartAt);
  const [athletes, entries, targetContext] = await Promise.all([
    listTeamAthletes(teamId),
    listEntriesByTeamWeek(teamId, normalizedWeekStartAt, weekEndAt),
    getEffectiveWeeklyTargetsForTeamWeek(teamId, normalizedWeekStartAt),
  ]);
  const summaries = summarizeEntriesByAthlete(entries);

  return athletes
    .map((athlete) => {
      const summary = summaries.get(athlete.id) ?? EMPTY_WEEK_ENTRY_SUMMARY;
      const effectiveTarget = targetContext.resolveForAthlete(athlete.id);
      const status: WeeklyStatus = effectiveTarget.isExempt
        ? "EXEMPT"
        : summary.totalMinutes >= effectiveTarget.requiredMinutes
          ? "MET"
          : "NOT_MET";

      return {
        id: athlete.id,
        athleteId: athlete.id,
        teamId,
        weekStartAt: normalizedWeekStartAt,
        weekEndAt,
        totalMinutes: summary.totalMinutes,
        totalDistance: summary.totalDistance,
        activityTypes: summary.activityTypes,
        hasHrData: summary.hasHrData,
        status,
        athlete,
      };
    })
    .sort((left, right) => right.totalMinutes - left.totalMinutes);
};

export const getTeamLeaderboard = async (
  teamId: string,
  weekStartAt: Date,
  _options: { rebuildIfMissing?: boolean } = {},
) => {
  const normalizedWeekStartAt = getWeekStartAt(weekStartAt);
  const weekEndAt = getWeekEndAt(normalizedWeekStartAt);
  const previousWeekStartAt = getPreviousWeekStartAt(normalizedWeekStartAt);
  const previousWeekEndAt = getWeekEndAt(previousWeekStartAt);
  const [athletes, entries, previousEntries, targetContext] = await Promise.all([
    listTeamAthletes(teamId),
    listEntriesByTeamWeek(teamId, normalizedWeekStartAt, weekEndAt),
    listEntriesByTeamWeek(teamId, previousWeekStartAt, previousWeekEndAt),
    getEffectiveWeeklyTargetsForTeamWeek(teamId, normalizedWeekStartAt),
  ]);
  const summaries = summarizeEntriesByAthlete(entries);
  const previousSummaries = summarizeEntriesByAthlete(previousEntries);

  return athletes
    .map((athlete) => {
      const summary = summaries.get(athlete.id) ?? EMPTY_WEEK_ENTRY_SUMMARY;
      const previousSummary =
        previousSummaries.get(athlete.id) ?? EMPTY_WEEK_ENTRY_SUMMARY;
      const effectiveTarget = targetContext.resolveForAthlete(athlete.id);
      const status: WeeklyStatus = effectiveTarget.isExempt
        ? "EXEMPT"
        : summary.totalMinutes >= effectiveTarget.requiredMinutes
          ? "MET"
          : "NOT_MET";
      const missingMinutes =
        !effectiveTarget.isExempt &&
        effectiveTarget.requiredMinutes > 0 &&
        status === "NOT_MET";

      return {
        id: athlete.id,
        athleteId: athlete.id,
        name: athlete.name ?? athlete.email,
        totalMinutes: summary.totalMinutes,
        status,
        activityTypes: summary.activityTypes,
        hasHr: summary.hasHrData,
        missingProof: summary.missingProof,
        pendingProof: summary.pendingProof,
        missingMinutes,
        totalDistance: summary.totalDistance,
        avgHr: summary.avgHr,
        previousWeekMinutes: previousSummary.totalMinutes,
        requiredMinutes: effectiveTarget.requiredMinutes,
        requirementSource: effectiveTarget.source,
      };
    })
    .sort((left, right) => right.totalMinutes - left.totalMinutes);
};

export const getTeamStats = async (teamId: string, weekStartAt: Date) => {
  const weekEndAt = getWeekEndAt(weekStartAt);
  const entries = await listEntriesByTeamWeek(teamId, weekStartAt, weekEndAt);
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
    // Step week boundaries using shared week utilities to avoid DST drift.
    loopWeek = getWeekEndAt(loopWeek);
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

  const sortedKeys = Array.from(weeksMap.keys()).sort();

  for (const key of sortedKeys) {
    const data = weeksMap.get(key)!;

    trend.push({
      weekStartAt: new Date(key),
      minutes: data.minutes,
      distance: data.distance,
      avgHr: getWeightedAvgHr(data.hrEntries),
    });
  }

  return trend;
};
