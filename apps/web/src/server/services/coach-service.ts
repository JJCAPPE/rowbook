import {
  ActivityType,
  PENDING_PROOF_STATUSES,
  ValidationStatus,
  getWeekStartAt,
  getWeekEndAt,
} from "@rowbook/shared";
import { prisma } from "@/db/client";
import {
  getTeamLeaderboard,
  getTeamStats,
  getTeamTrend,
} from "@/server/services/weekly-service";
import {
  listEntriesByTeamWeek,
  listEntriesForReview,
} from "@/server/repositories/training-entries";
import { listTeamAthletes, getUserById } from "@/server/repositories/users";
import { getAthleteHistoryWithEntries } from "@/server/services/athlete-service";
import { getProofViewUrl } from "@/server/services/proof-service";
import {
  getEffectiveWeeklyTargetsForTeamWeek,
  type WeeklyRequirementSource,
} from "@/server/services/weekly-target-service";

type TeamLeaderboardRow = {
  id: string;
  athleteId: string;
  name: string;
  totalMinutes: number;
  status: "MET" | "NOT_MET" | "EXEMPT";
  activityTypes: ActivityType[];
  hasHr: boolean;
  missingProof: boolean;
  pendingProof: boolean;
  missingMinutes: boolean;
  totalDistance: number;
  avgHr: number | null;
  previousWeekMinutes: number;
  requiredMinutes: number;
  requirementSource: WeeklyRequirementSource;
};

const getAuthorizedTeam = (actorId: string, teamId?: string) =>
  prisma.team.findFirst({
    where: {
      ...(teamId ? { id: teamId } : {}),
      coaches: { some: { coachId: actorId } },
    },
    orderBy: { createdAt: "asc" },
  });

export const listCoachTeams = (actorId: string) =>
  prisma.team.findMany({
    where: { coaches: { some: { coachId: actorId } } },
    orderBy: [{ name: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true },
  });

export const listCoachTeamAthletes = async (
  actorId: string,
  teamId?: string,
) => {
  const team = await getAuthorizedTeam(actorId, teamId);
  if (!team) {
    throw new Error("Team not found or access denied.");
  }

  const athletes = await prisma.user.findMany({
    where: { athleteProfile: { teamId: team.id } },
    orderBy: [{ name: "asc" }, { email: "asc" }],
    select: { id: true, name: true, email: true },
  });
  return athletes.map((athlete) => ({
    id: athlete.id,
    name: athlete.name ?? athlete.email,
  }));
};

export const getTeamOverview = async (
  actorId: string,
  teamId?: string,
  inputWeekStartAt?: Date,
) => {
  const team = await getAuthorizedTeam(actorId, teamId);
  if (!team) {
    throw new Error("Team not found.");
  }

  const week = inputWeekStartAt
    ? getWeekStartAt(inputWeekStartAt)
    : getWeekStartAt(new Date());
  const weekEndAt = getWeekEndAt(week);

  const [leaderboardResult, entries, targetContext, teamStats, teamTrend] =
    await Promise.all([
      getTeamLeaderboard(team.id, week),
      listEntriesByTeamWeek(team.id, week, weekEndAt),
      getEffectiveWeeklyTargetsForTeamWeek(team.id, week),
      getTeamStats(team.id, week),
      getTeamTrend(team.id, week, 6),
    ]);
  const leaderboard = leaderboardResult as TeamLeaderboardRow[];

  const summary = leaderboard.reduce(
    (acc, row) => {
      if (row.status === "MET") acc.met += 1;
      if (row.status === "NOT_MET") acc.notMet += 1;
      if (row.status === "EXEMPT") acc.exempt += 1;
      return acc;
    },
    { met: 0, notMet: 0, exempt: 0 },
  );

  const pendingProofCount = (
    entries as Array<{ validationStatus: ValidationStatus }>
  ).filter((entry) =>
    PENDING_PROOF_STATUSES.has(entry.validationStatus),
  ).length;

  const missingMinutesCount = leaderboard.filter(
    (row) => row.missingMinutes,
  ).length;

  return {
    teamId: team.id,
    weekStartAt: week,
    weekEndAt,
    requiredMinutes: targetContext.teamRequiredMinutes,
    summary,
    leaderboard,
    pendingProofCount,
    missingMinutesCount,
    teamStats,
    teamTrend,
  };
};

export const getAthleteDetail = async (
  actorId: string,
  athleteId: string,
  teamId?: string,
) => {
  const authorizedProfile = await prisma.athleteProfile.findFirst({
    where: {
      userId: athleteId,
      ...(teamId ? { teamId } : {}),
      team: { coaches: { some: { coachId: actorId } } },
    },
    select: { userId: true },
  });
  if (!authorizedProfile) {
    throw new Error("Athlete not found or access denied.");
  }

  const [athlete, seasonHistory] = await Promise.all([
    getUserById(athleteId),
    getAthleteHistoryWithEntries(athleteId, 52, true),
  ]);
  const entries = seasonHistory.flatMap((week) => week.entries);

  const activityMixMap = new Map<ActivityType, number>();

  for (const entry of entries) {
    if (entry.validationStatus === "REJECTED") continue;

    // Group for mix
    activityMixMap.set(
      entry.activityType,
      (activityMixMap.get(entry.activityType) ?? 0) + entry.minutes,
    );
  }

  const history = seasonHistory.map((week) => ({
      weekStartAt: week.weekStartAt,
      weekEndAt: week.weekEndAt,
      totalMinutes: week.totalMinutes,
      avgHr: week.avgHr,
      requiredMinutes: week.requiredMinutes,
      status: week.status,
      requirementSource: week.requirementSource,
      requirementReason: week.requirementReason,
    }));

  return {
    athlete: athlete
      ? {
          id: athlete.id,
          name: athlete.name ?? athlete.email,
        }
      : { id: athleteId, name: "Athlete" },
    entries,
    history,
    activityMix: Array.from(activityMixMap.entries()).map(
      ([type, minutes]) => ({
        type,
        minutes,
      }),
    ),
  };
};

export const getReviewQueue = async (
  actorId: string,
  teamId?: string,
  inputWeekStartAt?: Date,
  state: "NEEDS_REVIEW" | "CHECKING" | "COMPLETED" = "NEEDS_REVIEW",
  cursor?: string,
  limit = 20,
) => {
  const team = await prisma.team.findFirst({
    where: {
      ...(teamId ? { id: teamId } : {}),
      coaches: { some: { coachId: actorId } },
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!team) {
    throw new Error("Team not found or access denied.");
  }

  const weekStartAt = inputWeekStartAt
    ? getWeekStartAt(inputWeekStartAt)
    : getWeekStartAt(new Date());
  const weekEndAt = getWeekEndAt(weekStartAt);
  const rows = await listEntriesForReview(team.id, {
    weekStartAt,
    weekEndAt,
    state,
    cursor,
    limit,
  });
  const hasMore = rows.length > limit;
  const entries = hasMore ? rows.slice(0, limit) : rows;

  return {
    teamId: team.id,
    weekStartAt,
    weekEndAt,
    state,
    nextCursor: hasMore ? (entries.at(-1)?.id ?? null) : null,
    entries: entries.map((entry) => {
      const extraction = entry.evidenceExtractionJob;
      const firstProof = entry.proofImages[0];
      return {
        id: entry.id,
        version: entry.version,
        activityType: entry.activityType,
        minutes: entry.minutes,
        distance: entry.distance,
        avgHr: entry.avgHr,
        avgPace: entry.avgPace,
        avgWatts: entry.avgWatts,
        notes: entry.notes,
        date: entry.date,
        validationStatus: entry.validationStatus,
        rejectionNote: entry.rejectionNote,
        reviewedAt: entry.reviewedAt,
        athleteName: entry.athlete.name ?? "Athlete",
        proofExtractionStatus: extraction?.status ?? null,
        extractionFailureCode: extraction?.failureCode ?? null,
        extractedFields:
          extraction?.result ?? firstProof?.extractedFields ?? null,
        proofs: entry.proofImages.map((proof) => ({
          id: proof.id,
          fileName: proof.originalFileName,
          validationStatus: proof.validationStatus,
          available: true,
        })),
      };
    }),
  };
};

export const getReviewEvidence = async (
  actorId: string,
  entryId: string,
  expectedVersion: number,
) => {
  const entry = await prisma.trainingEntry.findFirst({
    where: {
      id: entryId,
      version: expectedVersion,
      athlete: {
        athleteProfile: {
          team: { coaches: { some: { coachId: actorId } } },
        },
      },
    },
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
      const view = await getProofViewUrl(actorId, proofImageId, true);
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

export const getWeeklySettings = async (
  actorId: string,
  teamId?: string,
  inputWeekStartAt?: Date,
) => {
  const team = await getAuthorizedTeam(actorId, teamId);
  if (!team) throw new Error("Team not found");

  const effectiveWeekStartAt = getWeekStartAt(inputWeekStartAt ?? new Date());
  const weekEndAt = getWeekEndAt(effectiveWeekStartAt);
  const currentWeekStartAt = getWeekStartAt(new Date());
  const isCurrentWeek =
    currentWeekStartAt.getTime() === effectiveWeekStartAt.getTime();

  const [targetContext, activeAthletes] = await Promise.all([
    getEffectiveWeeklyTargetsForTeamWeek(team.id, effectiveWeekStartAt),
    listTeamAthletes(team.id),
  ]);

  const athleteTargets = activeAthletes.map((athlete) => {
    const exemption = targetContext.exemptionsByAthlete.get(athlete.id) ?? null;
    const override = targetContext.overridesByAthlete.get(athlete.id) ?? null;
    const effective = targetContext.resolveForAthlete(athlete.id);

    return {
      athleteId: athlete.id,
      athleteName: athlete.name ?? "Unknown",
      teamRequiredMinutes: targetContext.teamRequiredMinutes,
      effectiveRequiredMinutes: effective.requiredMinutes,
      isExempt: effective.isExempt,
      requirementSource: effective.source,
      reason: effective.reason,
      exemption: exemption
        ? {
            id: exemption.id,
            reason: exemption.reason,
            isIndefinite: exemption.isIndefinite,
          }
        : null,
      override: override
        ? {
            id: override.id,
            requiredMinutes: override.requiredMinutes,
            reason: override.reason,
          }
        : null,
    };
  });

  const exemptions = athleteTargets
    .filter((target) => target.exemption)
    .map((target) => ({
      id: target.exemption!.id,
      athleteId: target.athleteId,
      athleteName: target.athleteName,
      reason: target.exemption!.reason,
      isIndefinite: target.exemption!.isIndefinite,
    }));

  const overrides = athleteTargets
    .filter((target) => target.override)
    .map((target) => ({
      id: target.override!.id,
      athleteId: target.athleteId,
      athleteName: target.athleteName,
      requiredMinutes: target.override!.requiredMinutes,
      reason: target.override!.reason,
    }));

  return {
    teamId: team.id,
    weekStartAt: effectiveWeekStartAt,
    weekEndAt,
    isCurrentWeek,
    requiredMinutes: targetContext.teamRequiredMinutes,
    exemptions,
    overrides,
    athleteTargets,
    athletes: activeAthletes.map((a) => ({
      id: a.id,
      name: a.name ?? "Unknown",
    })),
  };
};
