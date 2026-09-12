import { createHash } from "node:crypto";
import { Prisma, type ProofExtractionStatus } from "@prisma/client";
import {
  EvidenceExtractionResultSchema,
  MAX_PROOF_FILES,
  ProofExtractedFieldsSchema,
  calculatePaceSeconds,
  calculateWatts,
  getProofRetentionDeleteAfter,
  getWeekRange,
  isDateInFuture,
  nowInZone,
  type ActivityType,
  type ProofExtractedFields,
  type ValidationStatus,
} from "@rowbook/shared";
import { prisma } from "@/db/client";
import {
  getTrainingEntryById,
  listEntriesByAthleteWeek,
} from "@/server/repositories/training-entries";
import { getTeamIdForAthlete } from "@/server/repositories/users";
import { aggregateWeekForAthlete } from "@/server/services/weekly-service";
import { evaluateAutoVerification } from "@/server/services/validation-logic";
import { runProofExtraction } from "@/server/jobs/proof-extraction";
import { runInBackground } from "@/server/utils/background";

type CreateEntryInput = {
  clientSubmissionId: string;
  activityType: ActivityType;
  date: Date;
  minutes: number;
  distance: number;
  avgHr?: number | null;
  notes?: string | null;
  proofImageIds: string[];
  // Accepted during the compatibility window, but deliberately never trusted.
  proofOcr?: unknown;
};

type UpdateEntryInput = {
  id: string;
  expectedVersion: number;
  activityType?: ActivityType;
  date?: Date;
  minutes?: number;
  distance?: number;
  avgHr?: number | null;
  notes?: string | null;
};

const toInputJsonValue = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === "bigint" ? item.toString() : item,
    ),
  ) as Prisma.InputJsonValue;

const hashSubmission = (
  athleteId: string,
  input: CreateEntryInput,
  proofImageIds: string[],
) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        athleteId,
        activityType: input.activityType,
        date: input.date.toISOString(),
        minutes: input.minutes,
        distance: input.distance,
        avgHr: input.avgHr ?? null,
        notes: input.notes ?? null,
        proofImageIds,
      }),
    )
    .digest("hex");

const buildEvidenceKey = (
  athleteId: string,
  clientSubmissionId: string,
  evidenceRevision: number,
) =>
  createHash("sha256")
    .update(`${athleteId}:${clientSubmissionId}:${evidenceRevision}`)
    .digest("hex");

const assertWorkoutDateAllowed = (date: Date) => {
  const now = nowInZone();
  if (isDateInFuture(date, now)) {
    throw new Error("Workout date cannot be in the future.");
  }

  const oldestAllowed = now.minus({ days: 7 }).startOf("day").toMillis();
  if (date.getTime() < oldestAllowed) {
    throw new Error("Workout date must be within the last 7 days.");
  }
};

const syncTeamAggregatesForWeek = async (
  athleteId: string,
  weekStartAt: Date,
) => {
  try {
    const teamId = await getTeamIdForAthlete(athleteId);
    if (teamId) {
      await aggregateWeekForAthlete(teamId, athleteId, weekStartAt);
    }
  } catch (error) {
    console.error("Weekly aggregate reconciliation failed", {
      athleteId,
      weekStartAt: weekStartAt.toISOString(),
      error: error instanceof Error ? error.name : "UnknownError",
    });
  }
};

const persistedEvidence = (entry: {
  evidenceExtractionJob?: {
    status: ProofExtractionStatus;
    result: Prisma.JsonValue | null;
  } | null;
  proofImages?: Array<{ extractedFields: Prisma.JsonValue | null }>;
}): ProofExtractedFields[] => {
  const canonical = EvidenceExtractionResultSchema.safeParse(
    entry.evidenceExtractionJob?.result,
  );
  if (
    entry.evidenceExtractionJob?.status === "COMPLETED" &&
    canonical.success
  ) {
    return [canonical.data];
  }

  return (entry.proofImages ?? []).flatMap((proof) => {
    const parsed = ProofExtractedFieldsSchema.safeParse(proof.extractedFields);
    return parsed.success ? [parsed.data] : [];
  });
};

const pendingStatusFor = (status?: ProofExtractionStatus | null): ValidationStatus => {
  if (status === "FAILED") return "EXTRACTION_INCOMPLETE";
  return status ? "PENDING" : "NOT_CHECKED";
};

export const createEntry = async (
  athleteId: string,
  input: CreateEntryInput,
) => {
  if (input.proofImageIds.length === 0) {
    throw new Error("At least one proof image is required.");
  }
  if (input.proofImageIds.length > MAX_PROOF_FILES) {
    throw new Error(`A workout can include at most ${MAX_PROOF_FILES} proof images.`);
  }
  const uniqueProofImageIds = [...new Set(input.proofImageIds)].sort();
  if (uniqueProofImageIds.length !== input.proofImageIds.length) {
    throw new Error("Duplicate proof images are not allowed.");
  }

  const submissionHash = hashSubmission(
    athleteId,
    input,
    uniqueProofImageIds,
  );
  const existing = await prisma.trainingEntry.findUnique({
    where: {
      athleteId_clientSubmissionId: {
        athleteId,
        clientSubmissionId: input.clientSubmissionId,
      },
    },
    include: {
      evidenceExtractionJob: { select: { id: true, status: true } },
    },
  });
  if (existing) {
    if (existing.submissionHash !== submissionHash) {
      throw new Error("This submission was already saved with different values.");
    }
    const { evidenceExtractionJob, ...existingEntry } = existing;
    if (
      evidenceExtractionJob &&
      ["NOT_CHECKED", "PENDING", "PROCESSING"].includes(
        evidenceExtractionJob.status,
      )
    ) {
      runInBackground(
        "Evidence reconciliation failed",
        () => runProofExtraction({ jobId: evidenceExtractionJob.id }),
      );
    }
    return {
      entry: existingEntry,
      weekEndAt: getWeekRange(existing.weekStartAt).weekEndAt,
      idempotent: true,
    };
  }

  assertWorkoutDateAllowed(input.date);
  const { weekStartAt, weekEndAt } = getWeekRange(nowInZone());
  const proofDeleteAfter = getProofRetentionDeleteAfter(weekEndAt);
  const evidenceRevision = 1;
  const evidenceKey = buildEvidenceKey(
    athleteId,
    input.clientSubmissionId,
    evidenceRevision,
  );
  const avgPace = calculatePaceSeconds(
    input.activityType,
    input.distance,
    input.minutes,
  );
  const avgWatts = calculateWatts(input.activityType, avgPace);

  try {
    const saved = await prisma.$transaction(async (tx) => {
      const attachedAt = new Date();
      const [proofImages, legacyReferences] = await Promise.all([
        tx.proofImage.findMany({
          where: { id: { in: uniqueProofImageIds } },
        }),
        tx.trainingEntry.count({
          where: { proofImageId: { in: uniqueProofImageIds } },
        }),
      ]);

      const exactProofSet =
        proofImages.length === uniqueProofImageIds.length &&
        proofImages.every(
          (proof) =>
            proof.athleteId === athleteId &&
            proof.clientSubmissionId === input.clientSubmissionId &&
            proof.uploadedAt !== null &&
            proof.verifiedSize !== null &&
            proof.verifiedMimeType !== null &&
            proof.contentSha256 !== null &&
            proof.deletedAt === null &&
            proof.attachedAt === null &&
            proof.trainingEntryId === null,
        );

      if (
        proofImages.some(
          (proof) =>
            proof.athleteId === athleteId &&
            proof.deleteAfter.getTime() <= attachedAt.getTime(),
        )
      ) {
        throw new Error("One or more proof images expired. Upload them again.");
      }

      if (!exactProofSet || legacyReferences > 0) {
        throw new Error(
          "One or more proof images are missing, unconfirmed, or already used.",
        );
      }

      const contentHashes = proofImages.flatMap((proof) =>
        proof.contentSha256 ? [proof.contentSha256] : [],
      );
      const duplicateInSubmission =
        new Set(contentHashes).size !== contentHashes.length;
      const previouslyAttached = duplicateInSubmission
        ? null
        : await tx.proofImage.findFirst({
            where: {
              athleteId,
              contentSha256: { in: contentHashes },
              attachedAt: { not: null },
            },
            select: { id: true },
          });
      if (duplicateInSubmission || previouslyAttached) {
        throw new Error("This proof image was already used for a workout.");
      }

      const entry = await tx.trainingEntry.create({
        data: {
          athleteId,
          clientSubmissionId: input.clientSubmissionId,
          submissionHash,
          evidenceRevision,
          evidenceKey,
          activityType: input.activityType,
          date: input.date,
          minutes: input.minutes,
          distance: input.distance,
          avgHr: input.avgHr ?? null,
          avgPace,
          avgWatts,
          notes: input.notes ?? null,
          proofImageId: uniqueProofImageIds[0],
          validationStatus: "PENDING",
          entryStatus: "ACTIVE",
          weekStartAt,
          lockedAt: null,
        },
      });

      const attached = await tx.proofImage.updateMany({
        where: {
          id: { in: uniqueProofImageIds },
          athleteId,
          uploadedAt: { not: null },
          deletedAt: null,
          deleteAfter: { gt: attachedAt },
          attachedAt: null,
          trainingEntryId: null,
        },
        data: {
          trainingEntryId: entry.id,
          attachedAt,
          validationStatus: "PENDING",
        },
      });
      if (attached.count !== uniqueProofImageIds.length) {
        throw new Error("Workout proof was used by another submission.");
      }
      await tx.proofImage.updateMany({
        where: {
          id: { in: uniqueProofImageIds },
          trainingEntryId: entry.id,
          deleteAfter: { lt: proofDeleteAfter },
        },
        data: { deleteAfter: proofDeleteAfter },
      });

      const evidenceJob = await tx.evidenceExtractionJob.create({
        data: {
          athleteId,
          clientSubmissionId: input.clientSubmissionId,
          evidenceRevision,
          evidenceKey,
          proofImageIds: uniqueProofImageIds,
          entryId: entry.id,
          referenceDate: new Date(),
          status: "PENDING",
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: athleteId,
          entityType: "TRAINING_ENTRY",
          entityId: entry.id,
          action: "CREATE",
          after: toInputJsonValue(entry),
        },
      });

      return { entry, evidenceJobId: evidenceJob.id };
    });

    runInBackground(
      "Post-save reconciliation failed",
      () =>
        Promise.all([
          syncTeamAggregatesForWeek(athleteId, weekStartAt),
          runProofExtraction({ jobId: saved.evidenceJobId }),
        ]),
    );
    return {
      entry: saved.entry,
      evidenceJobId: saved.evidenceJobId,
      weekEndAt,
      idempotent: false,
    };
  } catch (error) {
    const raced = await prisma.trainingEntry.findUnique({
      where: {
        athleteId_clientSubmissionId: {
          athleteId,
          clientSubmissionId: input.clientSubmissionId,
        },
      },
    });
    if (raced?.submissionHash === submissionHash) {
      return {
        entry: raced,
        weekEndAt: getWeekRange(raced.weekStartAt).weekEndAt,
        idempotent: true,
      };
    }
    if (raced) {
      throw new Error("This submission was already saved with different values.");
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new Error("This proof image was already used for a workout.");
    }
    throw error;
  }
};

export const updateEntry = async (
  athleteId: string,
  input: UpdateEntryInput,
) => {
  const now = nowInZone();
  const { weekStartAt, weekEndAt } = getWeekRange(now);

  const updated = await prisma.$transaction(async (tx) => {
    const entry = await tx.trainingEntry.findUnique({
      where: { id: input.id },
      include: { proofImages: true, evidenceExtractionJob: true },
    });
    if (!entry || entry.athleteId !== athleteId) {
      throw new Error("Entry not found.");
    }
    if (entry.version !== input.expectedVersion) {
      throw new Error("Workout changed elsewhere. Reload it and try again.");
    }

    const entryInCurrentWeek =
      entry.weekStartAt.getTime() >= weekStartAt.getTime() &&
      entry.weekStartAt.getTime() < weekEndAt.getTime();
    if (entry.entryStatus === "LOCKED" || !entryInCurrentWeek) {
      throw new Error("Entry is locked.");
    }
    if (input.date) assertWorkoutDateAllowed(input.date);

    const activityType = input.activityType ?? entry.activityType;
    const date = input.date ?? entry.date;
    const minutes = input.minutes ?? entry.minutes;
    const distance = input.distance ?? entry.distance;
    const avgHr = "avgHr" in input ? (input.avgHr ?? null) : entry.avgHr;
    const avgPace = calculatePaceSeconds(activityType, distance, minutes);
    const avgWatts = calculateWatts(activityType, avgPace);
    const decisionFieldsChanged =
      activityType !== entry.activityType ||
      date.getTime() !== entry.date.getTime() ||
      minutes !== entry.minutes ||
      distance !== entry.distance ||
      avgHr !== entry.avgHr;

    let validationStatus = entry.validationStatus;
    if (decisionFieldsChanged) {
      const evidence = persistedEvidence(entry);
      validationStatus = evidence.length
        ? evaluateAutoVerification(
            { activityType, date, minutes, distance, avgHr },
            evidence,
          ).validationStatus
        : pendingStatusFor(entry.evidenceExtractionJob?.status);
    }

    const changed = await tx.trainingEntry.updateMany({
      where: { id: entry.id, athleteId, version: input.expectedVersion },
      data: {
        activityType,
        date,
        minutes,
        distance,
        avgHr,
        avgPace,
        avgWatts,
        notes: "notes" in input ? (input.notes ?? null) : entry.notes,
        validationStatus,
        rejectionNote: decisionFieldsChanged ? null : entry.rejectionNote,
        reviewedAt: decisionFieldsChanged ? null : entry.reviewedAt,
        reviewedById: decisionFieldsChanged ? null : entry.reviewedById,
        version: { increment: 1 },
      },
    });
    if (changed.count !== 1) {
      throw new Error("Workout changed elsewhere. Reload it and try again.");
    }

    if (decisionFieldsChanged) {
      await tx.proofImage.updateMany({
        where: { trainingEntryId: entry.id },
        data: {
          validationStatus,
          reviewedById: null,
        },
      });
    }

    const next = await tx.trainingEntry.findUniqueOrThrow({
      where: { id: entry.id },
    });
    await tx.auditLog.create({
      data: {
        actorId: athleteId,
        entityType: "TRAINING_ENTRY",
        entityId: entry.id,
        action: "UPDATE",
        before: toInputJsonValue(entry),
        after: toInputJsonValue(next),
      },
    });
    return { entry: next, weekStartAt: entry.weekStartAt };
  });

  runInBackground(
    "Post-edit aggregate reconciliation failed",
    () => syncTeamAggregatesForWeek(athleteId, updated.weekStartAt),
  );
  return { entry: updated.entry, weekEndAt };
};

export const deleteEntry = async (athleteId: string, entryId: string) => {
  const deleted = await prisma.$transaction(async (tx) => {
    const entry = await tx.trainingEntry.findUnique({ where: { id: entryId } });
    if (!entry || entry.athleteId !== athleteId) {
      throw new Error("Entry not found.");
    }

    const { weekStartAt, weekEndAt } = getWeekRange(nowInZone());
    const entryInCurrentWeek =
      entry.weekStartAt.getTime() >= weekStartAt.getTime() &&
      entry.weekStartAt.getTime() < weekEndAt.getTime();
    if (entry.entryStatus === "LOCKED" || !entryInCurrentWeek) {
      throw new Error("Entry is locked.");
    }

    await tx.trainingEntry.delete({ where: { id: entryId } });
    await tx.auditLog.create({
      data: {
        actorId: athleteId,
        entityType: "TRAINING_ENTRY",
        entityId: entryId,
        action: "DELETE",
        before: toInputJsonValue(entry),
      },
    });
    return entry;
  });

  runInBackground(
    "Post-delete aggregate reconciliation failed",
    () => syncTeamAggregatesForWeek(athleteId, deleted.weekStartAt),
  );
  return { success: true };
};

export const listEntriesForActiveWeek = async (athleteId: string) => {
  const { weekStartAt, weekEndAt } = getWeekRange(nowInZone());
  return listEntriesByAthleteWeek(athleteId, weekStartAt, weekEndAt);
};

export const getEntryValidationStatus = (athleteId: string, entryId: string) =>
  prisma.trainingEntry.findFirst({
    where: { id: entryId, athleteId, entryStatus: "ACTIVE" },
    select: {
      id: true,
      validationStatus: true,
      rejectionNote: true,
      version: true,
    },
  });
