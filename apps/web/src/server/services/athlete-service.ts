import { getPreviousWeekStartAt, getWeekEndAt, getWeekRange, ValidationStatus, nowInZone } from "@rowbook/shared";
import type { ActivityType, WeeklyStatus } from "@rowbook/shared";
import { prisma } from "@/db/client";
import { getTeamIdForAthlete } from "@/server/repositories/users";
import { listEntriesByAthleteSinceWeekStart, listEntriesByAthleteWeek } from "@/server/repositories/training-entries";
import { listWeeklyRequirementsByTeamSince } from "@/server/repositories/weekly-requirements";
import { listExemptionsByAthleteSince } from "@/server/repositories/exemptions";
import { listAthleteWeeklyRequirementOverridesByAthleteSince } from "@/server/repositories/athlete-weekly-requirement-overrides";
import { getProofViewUrl } from "@/server/services/proof-service";
import { getTeamLeaderboard, getTeamStats, getTeamTrend } from "@/server/services/weekly-service";
import { getWeightedAvgHr } from "@/server/utils/heart-rate";
import {
  getEffectiveWeeklyTarget,
  resolveEffectiveWeeklyTarget,
} from "@/server/services/weekly-target-service";

type AthleteEntryRecord = Awaited<
  ReturnType<typeof listEntriesByAthleteWeek>
>[number];

const toPublicEntry = (entry: AthleteEntryRecord) => {
  const { evidenceExtractionJob, proofImages, ...trainingEntry } = entry;
  return {
    ...trainingEntry,
    extractedFields:
      evidenceExtractionJob?.result ?? proofImages[0]?.extractedFields ?? null,
    proofs: proofImages.map((proof) => ({
      id: proof.id,
      fileName: proof.originalFileName,
      validationStatus: proof.validationStatus,
      available: true,
    })),
  };
};

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

const getNormalizedWeekStart = (date: Date) => getWeekRange(date).weekStartAt;
const getWeekKey = (date: Date) => getNormalizedWeekStart(date).toISOString();

export const getAthleteDashboard = async (
  athleteId: string,
  weekStartAt?: Date,
) => {
  const teamId = await getTeamIdForAthlete(athleteId);
  if (!teamId) {
    throw new Error("Athlete is not assigned to a team.");
  }

  const { weekStartAt: normalizedWeekStart, weekEndAt } = getWeekRange(
    weekStartAt ?? nowInZone(),
  );

  const [entries, effectiveTarget] = await Promise.all([
    listEntriesByAthleteWeek(athleteId, normalizedWeekStart, weekEndAt),
    getEffectiveWeeklyTarget(teamId, athleteId, normalizedWeekStart),
  ]);

  // Entries are canonical; an aggregate can briefly lag an acknowledged save.
  const totals = computeTotals(entries);
  const avgHr = getWeightedAvgHr(
    entries.filter((entry) => entry.validationStatus !== "REJECTED"),
  );
  const requiredMinutes = effectiveTarget.requiredMinutes;
  const status: WeeklyStatus = effectiveTarget.isExempt
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
    requirementSource: effectiveTarget.source,
    requirementReason: effectiveTarget.reason,
    entries: entries.map(toPublicEntry),
  };
};;

export const getAthleteHistory = async (athleteId: string) => {
  const weeks = await getAthleteHistoryWithEntries(athleteId, 32, true);

  return weeks.map((week) => ({
    athleteId,
    weekStartAt: week.weekStartAt,
    weekEndAt: week.weekEndAt,
    totalMinutes: week.totalMinutes,
    totalDistance: week.totalDistance,
    activityTypes: week.activityTypes,
    hasHrData: week.hasHrData,
    status: week.status,
    avgHr: week.avgHr,
    requiredMinutes: week.requiredMinutes,
    requirementSource: week.requirementSource,
    requirementReason: week.requirementReason,
  }));
};

export const getAthleteHistoryWithEntries = async (
  athleteId: string,
  weekCount = 32,
  includeEmptyWeeks = false,
) => {
  const teamId = await getTeamIdForAthlete(athleteId);
  if (!teamId) {
    throw new Error("Athlete is not assigned to a team.");
  }

  const { weekStartAt: currentWeekStart } = getWeekRange(nowInZone());
  const boundedWeekCount = Math.min(52, Math.max(1, Math.floor(weekCount)));
  let earliestWeekStart = currentWeekStart;

  for (let index = 1; index < boundedWeekCount; index += 1) {
    earliestWeekStart = getPreviousWeekStartAt(earliestWeekStart);
  }
  const seasonEndAt = getWeekEndAt(currentWeekStart);

  const [entriesResult, requirementsResult, exemptionsResult, overridesResult] = await Promise.all([
    listEntriesByAthleteSinceWeekStart(athleteId, earliestWeekStart, seasonEndAt),
    listWeeklyRequirementsByTeamSince(teamId, earliestWeekStart, seasonEndAt),
    listExemptionsByAthleteSince(athleteId, earliestWeekStart, seasonEndAt),
    listAthleteWeeklyRequirementOverridesByAthleteSince(
      athleteId,
      earliestWeekStart,
      seasonEndAt,
    ),
  ]);

  const entries = entriesResult;
  const overrides = overridesResult as Array<{
    id: string;
    athleteId: string;
    weekStartAt: Date;
    requiredMinutes: number;
    reason: string | null;
  }>;
  const requirementsByWeek = new Map(
    requirementsResult.map((requirement) => [
      getWeekKey(requirement.weekStartAt),
      requirement.requiredMinutes,
    ]),
  );
  const weeklyExemptionsByWeek = new Map(
    exemptionsResult
      .filter((exemption) => !exemption.isIndefinite)
      .map((exemption) => [getWeekKey(exemption.weekStartAt), exemption]),
  );
  const indefiniteExemptions = exemptionsResult
    .filter((exemption) => exemption.isIndefinite)
    .sort((a, b) => b.weekStartAt.getTime() - a.weekStartAt.getTime());
  const overridesByWeek = new Map(
    overrides.map((override) => [getWeekKey(override.weekStartAt), override]),
  );

  const weeksByKey = new Map<
    string,
    { weekStartAt: Date; entries: AthleteEntryRecord[] }
  >();

  if (includeEmptyWeeks) {
    let weekStartAt = currentWeekStart;
    for (let index = 0; index < boundedWeekCount; index += 1) {
      weeksByKey.set(getWeekKey(weekStartAt), {
        weekStartAt,
        entries: [],
      });
      weekStartAt = getPreviousWeekStartAt(weekStartAt);
    }
  }

  for (const entry of entries) {
    const key = getWeekKey(entry.weekStartAt);
    const normalizedWeekStart = getWeekRange(entry.weekStartAt).weekStartAt;
    const current = weeksByKey.get(key);
    if (current) {
      current.entries.push(entry);
    } else {
      weeksByKey.set(key, { weekStartAt: normalizedWeekStart, entries: [entry] });
    }
  }
  return Array.from(weeksByKey.values())
    .map(({ weekStartAt, entries: weekEntries }) => {
      const activityTypes = new Set<ActivityType>();
      let totalMinutes = 0;
      let totalDistance = 0;
      let hasHrData = false;

      for (const entry of weekEntries) {
        if (entry.validationStatus === "REJECTED") {
          continue;
        }
        totalMinutes += entry.minutes;
        totalDistance += entry.distance;
        activityTypes.add(entry.activityType);
        if (entry.avgHr !== null && entry.avgHr !== undefined) {
          hasHrData = true;
        }
      }

      const weekKey = getWeekKey(weekStartAt);
      const weekEndAt = getWeekEndAt(weekStartAt);
      const weeklyExemption = weeklyExemptionsByWeek.get(weekKey) ?? null;
      const indefiniteExemption = indefiniteExemptions.find(
        (exemption) => exemption.weekStartAt < weekEndAt,
      ) ?? null;
      const exemption = weeklyExemption ?? indefiniteExemption;
      const override = overridesByWeek.get(weekKey) ?? null;
      const effectiveTarget = resolveEffectiveWeeklyTarget(
        requirementsByWeek.get(weekKey) ?? 0,
        exemption,
        override,
      );
      const status: WeeklyStatus = effectiveTarget.isExempt
        ? "EXEMPT"
        : totalMinutes >= effectiveTarget.requiredMinutes
          ? "MET"
          : "NOT_MET";

      const sortedEntries = [...weekEntries].sort(
        (a, b) => b.date.getTime() - a.date.getTime(),
      );

      return {
        weekStartAt,
        weekEndAt,
        totalMinutes,
        totalDistance,
        avgHr: getWeightedAvgHr(
          weekEntries.filter(
            (entry) => entry.validationStatus !== "REJECTED",
          ),
        ),
        requiredMinutes: effectiveTarget.requiredMinutes,
        status,
        hasHrData,
        requirementSource: effectiveTarget.source,
        requirementReason: effectiveTarget.reason,
        activityTypes: Array.from(activityTypes),
        entries: sortedEntries.map(toPublicEntry),
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
  const entries = await listEntriesByAthleteWeek(
    athleteId,
    normalizedWeekStart,
    weekEndAt,
  );

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
    entries: entries.map(toPublicEntry),
  };
};

export const getAthleteEntryEvidence = async (
  athleteId: string,
  entryId: string,
  expectedVersion: number,
) => {
  const entry = await prisma.trainingEntry.findFirst({
    where: { id: entryId, athleteId, version: expectedVersion },
    select: {
      id: true,
      version: true,
      proofImageId: true,
      proofImages: {
        where: { uploadedAt: { not: null }, deletedAt: null },
        select: { id: true, originalFileName: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!entry) {
    throw new Error("Workout evidence is unavailable or changed.");
  }

  const proofIds = [
    ...new Set([
      ...entry.proofImages.map((proof) => proof.id),
      ...(entry.proofImageId ? [entry.proofImageId] : []),
    ]),
  ];
  const images = await Promise.all(
    proofIds.map(async (proofImageId, index) => {
      const view = await getProofViewUrl(athleteId, proofImageId, false);
      const metadata = entry.proofImages.find(
        (proof) => proof.id === proofImageId,
      );
      return {
        id: proofImageId,
        src: view.signedUrl,
        alt: `Workout proof ${index + 1}`,
        fileName: metadata?.originalFileName ?? null,
      };
    }),
  );

  return { entryId: entry.id, version: entry.version, images };
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
