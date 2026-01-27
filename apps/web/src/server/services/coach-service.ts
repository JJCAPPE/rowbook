import {
  ActivityType,
  PENDING_PROOF_STATUSES,
  ProofExtractionStatus,
  ValidationStatus,
  getWeekEndAt,
  getWeekRange,
} from "@rowbook/shared";
import type { TrainingEntry } from "@rowbook/shared";
import { getDefaultTeam } from "@/server/repositories/teams";
import { getTeamLeaderboard } from "@/server/services/weekly-service";
import { listEntriesByAthlete, listEntriesByTeamWeek, listEntriesForReview } from "@/server/repositories/training-entries";
import { listWeeklyAggregatesByAthlete } from "@/server/repositories/weekly-aggregates";
import { listTeamAthletes, getUserById } from "@/server/repositories/users";
import { getWeeklyRequirement } from "@/server/repositories/weekly-requirements";
import { listExemptionsByWeek } from "@/server/repositories/exemptions";
import { getProofViewUrl } from "@/server/services/proof-service";

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
};

type ReviewEntry = {
  id: string;
  proofImageId: string;
  activityType: ActivityType;
  minutes: number;
  distance: number;
  avgHr: number | null;
  avgPace: number | null;
  avgWatts: number | null;
  notes: string | null;
  date: Date;
  validationStatus: ValidationStatus;
  athlete: { name: string | null; email: string };
  proofImage: {
    reviewedById: string | null;
    proofExtractionJob: { status: ProofExtractionStatus; lastError: string | null } | null;
  };
};

const attachProofUrls = async <T extends { proofImageId: string }>(
  entries: T[],
  actorId: string,
  canViewAll: boolean,
): Promise<Array<T & { proofUrl: string | null }>> =>
  Promise.all(
    entries.map(async (entry) => {
      try {
        const view = await getProofViewUrl(actorId, entry.proofImageId, canViewAll);
        return { ...entry, proofUrl: view.signedUrl };
      } catch {
        return { ...entry, proofUrl: null };
      }
    }),
  );

export const getTeamOverview = async (teamId?: string, weekStartAt?: Date) => {
  const team = teamId ? { id: teamId } : await getDefaultTeam();
  if (!team) {
    throw new Error("Team not found.");
  }

  const week = weekStartAt ? getWeekRange(weekStartAt).weekStartAt : getWeekRange(new Date()).weekStartAt;
  const weekEndAt = getWeekEndAt(week);

  const [leaderboardResult, entries, requirement] = await Promise.all([
    getTeamLeaderboard(team.id, week),
    listEntriesByTeamWeek(team.id, week),
    getWeeklyRequirement(team.id, week),
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

  const pendingProofCount = (entries as Array<{ validationStatus: ValidationStatus }>).filter(
    (entry) => PENDING_PROOF_STATUSES.has(entry.validationStatus),
  ).length;

  const missingMinutesCount = leaderboard.filter((row) => row.missingMinutes).length;

  return {
    teamId: team.id,
    weekStartAt: week,
    weekEndAt,
    requiredMinutes: requirement?.requiredMinutes ?? 0,
    summary,
    leaderboard,
    pendingProofCount,
    missingMinutesCount,
  };
};

export const getAthleteDetail = async (actorId: string, athleteId: string) => {
  const [athlete, entriesResult, history] = await Promise.all([
    getUserById(athleteId),
    listEntriesByAthlete(athleteId),
    listWeeklyAggregatesByAthlete(athleteId),
  ]);
  const entries = entriesResult as TrainingEntry[];

  const entriesWithProof = await attachProofUrls(entries, actorId, true);

  const activityMixMap = new Map<ActivityType, number>();
  for (const entry of entries) {
    activityMixMap.set(entry.activityType, (activityMixMap.get(entry.activityType) ?? 0) + entry.minutes);
  }

  return {
    athlete: athlete
      ? {
          id: athlete.id,
          name: athlete.name ?? athlete.email,
        }
      : { id: athleteId, name: "Athlete" },
    entries: entriesWithProof,
    history,
    activityMix: Array.from(activityMixMap.entries()).map(([type, minutes]) => ({
      type,
      minutes,
    })),
  };
};

export const getReviewQueue = async (
  actorId: string,
  teamId?: string,
  weekStartAt?: Date,
) => {
  const team = teamId ? { id: teamId } : await getDefaultTeam();
  if (!team) {
    throw new Error("Team not found.");
  }

  const week = weekStartAt ? getWeekRange(weekStartAt).weekStartAt : getWeekRange(new Date()).weekStartAt;
  const entries = (await listEntriesForReview(
    team.id,
    week,
    Array.from(PENDING_PROOF_STATUSES),
    { includeReviewed: true },
  )) as ReviewEntry[];
  const entriesWithProof = await attachProofUrls(entries, actorId, true);

  return {
    teamId: team.id,
    weekStartAt: week,
    entries: entriesWithProof.map(({ athlete, proofImage, ...rest }) => ({
      ...rest,
      athleteName: athlete?.name ?? athlete?.email ?? null,
      proofExtractionStatus: proofImage?.proofExtractionJob?.status ?? null,
      proofReviewedById: proofImage?.reviewedById ?? null,
    })),
  };
};

export const getWeeklySettings = async (teamId?: string, weekStartAt?: Date) => {
  const team = teamId ? { id: teamId } : await getDefaultTeam();
  if (!team) {
    throw new Error("Team not found.");
  }

  const week = weekStartAt ? getWeekRange(weekStartAt).weekStartAt : getWeekRange(new Date()).weekStartAt;
  const weekEndAt = getWeekEndAt(week);

  const [requirement, exemptionsResult, athletesResult] = await Promise.all([
    getWeeklyRequirement(team.id, week),
    listExemptionsByWeek(week, team.id),
    listTeamAthletes(team.id),
  ]);
  const exemptions = exemptionsResult as Array<{
    id: string;
    athleteId: string;
    reason: string | null;
    athlete: { name: string | null; email: string };
  }>;
  const athletes = athletesResult as Array<{
    id: string;
    name: string | null;
    email: string;
  }>;

  return {
    teamId: team.id,
    weekStartAt: week,
    weekEndAt,
    requiredMinutes: requirement?.requiredMinutes ?? 0,
    exemptions: exemptions.map((exemption) => ({
      id: exemption.id,
      athleteId: exemption.athleteId,
      athleteName: exemption.athlete.name ?? exemption.athlete.email,
      reason: exemption.reason,
    })),
    athletes: athletes.map((athlete) => ({
      id: athlete.id,
      name: athlete.name ?? athlete.email,
    })),
  };
};
