import { getWeekRange, isWithinWeek, ValidationStatus } from "@rowbook/shared";
import {
  createTrainingEntry,
  deleteTrainingEntry,
  getTrainingEntryById,
  listEntriesByAthleteWeek,
  updateTrainingEntry,
} from "@/server/repositories/training-entries";
import { getTeamIdForAthlete } from "@/server/repositories/users";
import { getProofImageById } from "@/server/repositories/proof-images";
import { createProofExtractionJob } from "@/server/repositories/proof-extraction-jobs";
import { createAuditLog } from "@/server/repositories/audit-logs";
import { aggregateWeekForTeam } from "@/server/services/weekly-service";

const syncTeamAggregatesForWeek = async (athleteId: string, weekStartAt: Date) => {
  const teamId = await getTeamIdForAthlete(athleteId);
  if (!teamId) {
    return;
  }

  await aggregateWeekForTeam(teamId, weekStartAt);
};

export const createEntry = async (athleteId: string, input: {
  activityType: "ERG" | "RUN" | "CYCLE" | "SWIM" | "OTHER";
  date: Date;
  minutes: number;
  distance: number;
  avgHr?: number | null;
  notes?: string | null;
  proofImageId: string;
}) => {
  const now = new Date();
  const { weekStartAt, weekEndAt } = getWeekRange(now);

  if (!isWithinWeek(input.date, weekStartAt)) {
    throw new Error("Entry date must be within the active week.");
  }
  if (input.date.getTime() > now.getTime()) {
    throw new Error("Entry date cannot be in the future.");
  }

  const proofImage = await getProofImageById(input.proofImageId);
  if (!proofImage || proofImage.athleteId !== athleteId) {
    throw new Error("Proof image not found for athlete.");
  }

  if (!proofImage.uploadedAt) {
    throw new Error("Proof image has not been uploaded yet.");
  }

  const entry = await createTrainingEntry({
    athleteId,
    activityType: input.activityType,
    date: input.date,
    minutes: input.minutes,
    distance: input.distance,
    avgHr: input.avgHr ?? null,
    notes: input.notes ?? null,
    proofImageId: input.proofImageId,
    validationStatus: "NOT_CHECKED" as ValidationStatus,
    entryStatus: "ACTIVE",
    weekStartAt,
    lockedAt: null,
  });

  await createProofExtractionJob(input.proofImageId);
  await createAuditLog({
    actorId: athleteId,
    entityType: "TRAINING_ENTRY",
    entityId: entry.id,
    action: "CREATE",
    after: entry,
  });
  await syncTeamAggregatesForWeek(athleteId, weekStartAt);

  return { entry, weekEndAt };
};

export const updateEntry = async (athleteId: string, input: {
  id: string;
  activityType?: "ERG" | "RUN" | "CYCLE" | "SWIM" | "OTHER";
  date?: Date;
  minutes?: number;
  distance?: number;
  avgHr?: number | null;
  notes?: string | null;
}) => {
  const entry = await getTrainingEntryById(input.id);
  if (!entry || entry.athleteId !== athleteId) {
    throw new Error("Entry not found.");
  }

  const now = new Date();
  const { weekStartAt, weekEndAt } = getWeekRange(now);
  if (entry.entryStatus === "LOCKED" || entry.weekStartAt.getTime() !== weekStartAt.getTime()) {
    throw new Error("Entry is locked.");
  }

  if (input.date) {
    if (!isWithinWeek(input.date, weekStartAt)) {
      throw new Error("Entry date must be within the active week.");
    }
    if (input.date.getTime() > now.getTime()) {
      throw new Error("Entry date cannot be in the future.");
    }
  }

  const updated = await updateTrainingEntry(entry.id, {
    activityType: input.activityType,
    date: input.date,
    minutes: input.minutes,
    distance: input.distance,
    avgHr: input.avgHr ?? undefined,
    notes: input.notes ?? undefined,
  });

  await createAuditLog({
    actorId: athleteId,
    entityType: "TRAINING_ENTRY",
    entityId: entry.id,
    action: "UPDATE",
    before: entry,
    after: updated,
  });
  await syncTeamAggregatesForWeek(athleteId, entry.weekStartAt);

  return { entry: updated, weekEndAt };
};

export const deleteEntry = async (athleteId: string, entryId: string) => {
  const entry = await getTrainingEntryById(entryId);
  if (!entry || entry.athleteId !== athleteId) {
    throw new Error("Entry not found.");
  }

  const now = new Date();
  const { weekStartAt } = getWeekRange(now);
  if (entry.entryStatus === "LOCKED" || entry.weekStartAt.getTime() !== weekStartAt.getTime()) {
    throw new Error("Entry is locked.");
  }

  await deleteTrainingEntry(entryId);
  await createAuditLog({
    actorId: athleteId,
    entityType: "TRAINING_ENTRY",
    entityId: entryId,
    action: "DELETE",
    before: entry,
  });
  await syncTeamAggregatesForWeek(athleteId, entry.weekStartAt);

  return { success: true };
};

export const listEntriesForActiveWeek = async (athleteId: string) => {
  const { weekStartAt } = getWeekRange(new Date());
  return listEntriesByAthleteWeek(athleteId, weekStartAt);
};
