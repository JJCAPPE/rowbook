import {
  ActivityType,
  PENDING_PROOF_STATUSES,
  ProofExtractionStatus,
  ValidationStatus,
  getWeekEndAt,
  getWeekRange,
  nowInZone,
} from "@rowbook/shared";
import type { TrainingEntry } from "@rowbook/shared";
import { getDefaultTeam, getTeamById, updateTeam } from "@/server/repositories/teams";
import { getTeamLeaderboard, getTeamStats, getTeamTrend } from "@/server/services/weekly-service";
import { listEntriesByAthlete, listEntriesByTeamWeek, listEntriesForReview } from "@/server/repositories/training-entries";
import { listWeeklyAggregatesByAthlete } from "@/server/repositories/weekly-aggregates";
import { listTeamAthletes, getUserById } from "@/server/repositories/users";
import { getWeeklyRequirement } from "@/server/repositories/weekly-requirements";
import { listExemptionsByWeek } from "@/server/repositories/exemptions";
import { getProofViewUrl } from "@/server/services/proof-service";
import { getWeightedAvgHr } from "@/server/utils/heart-rate";
import { createAuditLog } from "@/server/repositories/audit-logs";
import { getIsoWeekKey, getWeekStartAt } from "@rowbook/shared";

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
  rejectionNote: string | null;
  athlete: { name: string | null; email: string };
  proofImages: Array<{
    id: string;
    reviewedById: string | null;
    proofExtractionJob: { status: ProofExtractionStatus; lastError: string | null } | null;
    extractedFields: any;
  }>;
};

const attachProofs = async <T extends { proofImages: Array<any> }>(
  entries: T[],
  athleteId: string,
  canViewAll: boolean,
): Promise<Array<T & { proofs: Array<{ id: string; url: string; extractedFields: any }> }>> =>
  Promise.all(
    entries.map(async (entry: any) => {
      const proofs = await Promise.all(
        (entry.proofImages || []).map(async (proof: any) => {
          try {
            const view = await getProofViewUrl(athleteId, proof.id, canViewAll);
            return { id: proof.id, url: view.signedUrl, extractedFields: proof.extractedFields };
          } catch {
            return { id: proof.id, url: "", extractedFields: proof.extractedFields };
          }
        })
      );
      return { ...entry, proofs };
    }),
  );

export const getTeamOverview = async (teamId?: string, inputWeekStartAt?: Date) => {
  const team = teamId ? await getTeamById(teamId) : await getDefaultTeam();
  if (!team) {
    throw new Error("Team not found.");
  }

  const cutoffHour = (team as any).weekCutoffHour ?? 18;
  const week = inputWeekStartAt ? getWeekStartAt(inputWeekStartAt, team.timezone, cutoffHour) : getWeekStartAt(new Date(), team.timezone, cutoffHour);
  const weekEndAt = getWeekEndAt(week, team.timezone);

  const [leaderboardResult, entries, requirement, teamStats, teamTrend] = await Promise.all([
    getTeamLeaderboard(team.id, week, team.timezone, cutoffHour),
    listEntriesByTeamWeek(team.id, week),
    getWeeklyRequirement(team.id, week),
    getTeamStats(team.id, week),
    getTeamTrend(team.id, week, 6, team.timezone, cutoffHour),
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
    teamStats,
    teamTrend,
  };
};

export const getAthleteDetail = async (actorId: string, athleteId: string) => {
  const [athlete, entriesResult, history] = await Promise.all([
    getUserById(athleteId),
    listEntriesByAthlete(athleteId),
    listWeeklyAggregatesByAthlete(athleteId),
  ]);
  const entries = entriesResult as TrainingEntry[];
  
  const entriesWithProofs = await attachProofs(entries as any[], athleteId, true);

  const activityMixMap = new Map<ActivityType, number>();
  const entriesByIsoWeek = new Map<string, TrainingEntry[]>();

  for (const entry of entries) {
    if (entry.validationStatus === "REJECTED") continue;
    
    // Group for mix
    activityMixMap.set(entry.activityType, (activityMixMap.get(entry.activityType) ?? 0) + entry.minutes);
    
    // Group for Weekly HR
    const key = getIsoWeekKey(entry.weekStartAt);
    const list = entriesByIsoWeek.get(key) ?? [];
    list.push(entry);
    entriesByIsoWeek.set(key, list);
  }

  // Deduplicate weekly aggregates by week range key to handle cases where
  // weekStartAt timestamps differ slightly but represent the same week
  const weekMap = new Map<string, {
    weekStartAt: Date;
    weekEndAt: Date;
    totalMinutes: number;
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
      existing.totalMinutes += week.totalMinutes;
      // avgHr is constant for the weekKey (derived from entries), so no update needed
    } else {
      weekMap.set(weekKey, {
        weekStartAt: week.weekStartAt,
        weekEndAt: week.weekEndAt,
        totalMinutes: week.totalMinutes,
        avgHr: entriesAvgHr, // Use entries calculation
      });
    }
  }

  // Convert map back to array
  const deduplicatedHistory = Array.from(weekMap.values())
    .map((week) => ({
      weekStartAt: week.weekStartAt,
      weekEndAt: week.weekEndAt,
      totalMinutes: week.totalMinutes,
      avgHr: week.avgHr,
    }))
    .sort((a, b) => b.weekStartAt.getTime() - a.weekStartAt.getTime());

  return {
    athlete: athlete
      ? {
          id: athlete.id,
          name: athlete.name ?? athlete.email,
        }
      : { id: athleteId, name: "Athlete" },
    entries: entriesWithProofs.map(e => ({
        ...e,
        proofs: e.proofs,
        extractedFields: e.proofs[0]?.extractedFields ?? null,
        proofUrl: e.proofs[0]?.url ?? null,
    })),
    history: deduplicatedHistory,
    activityMix: Array.from(activityMixMap.entries()).map(([type, minutes]) => ({
      type,
      minutes,
    })),
  };
};

export const getReviewQueue = async (
  actorId: string,
  teamId?: string,
  inputWeekStartAt?: Date,
) => {
  const team = teamId ? await getTeamById(teamId) : await getDefaultTeam();
  if (!team) {
    throw new Error("Team not found.");
  }

  const cutoffHour = (team as any).weekCutoffHour ?? 18;
  const week = inputWeekStartAt ? getWeekStartAt(inputWeekStartAt, team.timezone, cutoffHour) : getWeekStartAt(new Date(), team.timezone, cutoffHour);
  const weekEndAt = getWeekEndAt(week, team.timezone);

  const entries = (await listEntriesForReview(
    team.id,
    Array.from(PENDING_PROOF_STATUSES),
    { includeReviewed: true },
  )) as unknown as ReviewEntry[];
  
  const entriesWithProofs = await attachProofs(entries, actorId, true);

  return {
    teamId: team.id,
    weekStartAt: week,
    entries: entriesWithProofs.map(({ athlete, proofs, ...rest }: any) => {
      const rejectionNote = rest.rejectionNote;
      return {
        ...rest,
        proofs,
        rejectionNote,
        athleteName: athlete?.name ?? athlete?.email ?? null,
        // Use first proof for these or expose array to frontend?
        proofExtractionStatus: rest.proofImages?.[0]?.proofExtractionJob?.status ?? null,
        proofReviewedById: rest.proofImages?.[0]?.reviewedById ?? null,
        extractedFields: proofs[0]?.extractedFields ?? null,
        proofUrl: proofs[0]?.url ?? null,
      };
    }),
  };
};

export const getWeeklySettings = async (teamId?: string, inputWeekStartAt?: Date) => {
  const team = teamId ? await getTeamById(teamId) : await getDefaultTeam();
  if (!team) throw new Error("Team not found");

  // Cast team to any to access weekCutoffHour until types are fully regenerated
  const cutoffHour = (team as any).weekCutoffHour ?? 18;

  const effectiveWeekStartAt = getWeekStartAt(inputWeekStartAt ?? new Date(), team.timezone, cutoffHour);
  const weekEndAt = getWeekEndAt(effectiveWeekStartAt, team.timezone);

  const [requirement, exemptions, activeAthletes] = await Promise.all([
    getWeeklyRequirement(team.id, effectiveWeekStartAt),
    listExemptionsByWeek(effectiveWeekStartAt, team.id),
    listTeamAthletes(team.id),
  ]);

  return {
    teamId: team.id,
    weekStartAt: effectiveWeekStartAt,
    weekEndAt,
    weekCutoffHour: cutoffHour as number,
    requiredMinutes: requirement?.requiredMinutes,
    exemptions: exemptions.map((e) => ({
      id: e.id,
      athleteId: e.athleteId,
      athleteName: e.athlete.name ?? "Unknown",
      reason: e.reason,
      isIndefinite: (e as any).isIndefinite,
    })),
    athletes: activeAthletes.map((a) => ({
      id: a.id,
      name: a.name ?? "Unknown",
    })),
  };
};

export const updateTeamSettings = async (
  actorId: string,
  teamId: string,
  settings: { weekCutoffHour: number },
) => {
  await updateTeam(teamId, settings);
  
  await createAuditLog({
    actorId,
    entityType: "TEAM_SETTINGS",
    entityId: teamId,
    action: "UPDATE",
    after: settings,
  });
  
  return { success: true };
};
