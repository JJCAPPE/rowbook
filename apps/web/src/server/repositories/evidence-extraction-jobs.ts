import { randomUUID } from "node:crypto";

import { prisma } from "@/db/client";
import {
  Prisma,
  type ActivityType,
  type EvidenceExtractionJob,
  type ValidationStatus,
} from "@prisma/client";
import type { EvidenceExtractionResult } from "@rowbook/shared";

export const MAX_EVIDENCE_EXTRACTION_ATTEMPTS = 3;
export const EVIDENCE_EXTRACTION_LEASE_MS = 2 * 60 * 1000;

const MUTABLE_AUTOMATIC_STATUSES: ValidationStatus[] = [
  "NOT_CHECKED",
  "PENDING",
  "EXTRACTION_INCOMPLETE",
];
const AUTOMATIC_RESULT_STATUSES: ValidationStatus[] = [
  ...MUTABLE_AUTOMATIC_STATUSES,
  "VERIFIED",
];
type TransactionClient = Prisma.TransactionClient;

export type ClaimedEvidenceExtractionJob = EvidenceExtractionJob & {
  claimToken: string;
};

export type EvidenceProofImage = {
  id: string;
  storagePath: string;
  trainingEntryId: string | null;
  verifiedSize: number;
  contentSha256: string;
};

export type EvidenceEntrySnapshot = {
  id: string;
  activityType: ActivityType;
  date: Date;
  minutes: number;
  distance: number;
  avgHr: number | null;
  version: number;
  validationStatus: ValidationStatus;
};

export type EvidenceExtractionMetadata = {
  provider: string;
  model: string;
  modelVersion: string | null;
  promptVersion: string;
  schemaVersion: string;
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
};

const compactText = (value: string, maxLength: number) =>
  value.replace(/\s+/g, " ").trim().slice(0, maxLength);

const toInputJsonValue = (value: unknown): Prisma.InputJsonValue =>
  JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === "bigint" ? item.toString() : item,
    ),
  ) as Prisma.InputJsonValue;

const applyTerminalFailureToCurrentEntry = async (
  tx: TransactionClient,
  job: Pick<
    EvidenceExtractionJob,
    | "id"
    | "athleteId"
    | "clientSubmissionId"
    | "evidenceKey"
    | "evidenceRevision"
    | "entryId"
    | "proofImageIds"
  >,
) => {
  const entry = await tx.trainingEntry.findUnique({
    where: { evidenceKey: job.evidenceKey },
  });
  const matchesCurrentEvidence =
    entry !== null &&
    entry.athleteId === job.athleteId &&
    entry.evidenceRevision === job.evidenceRevision &&
    (job.entryId === null || job.entryId === entry.id);
  if (
    !entry ||
    !matchesCurrentEvidence ||
    entry.reviewedAt !== null ||
    entry.reviewedById !== null ||
    !MUTABLE_AUTOMATIC_STATUSES.includes(entry.validationStatus)
  ) {
    return false;
  }

  const currentProofs = await tx.proofImage.findMany({
    where: {
      id: { in: job.proofImageIds },
      athleteId: job.athleteId,
      clientSubmissionId: job.clientSubmissionId,
      trainingEntryId: entry.id,
    },
    select: { reviewedById: true, validationStatus: true },
  });
  if (
    currentProofs.length !== job.proofImageIds.length ||
    currentProofs.some(
      (proofImage) =>
        proofImage.reviewedById !== null ||
        !MUTABLE_AUTOMATIC_STATUSES.includes(proofImage.validationStatus),
    )
  ) {
    return false;
  }

  const entryUpdate = await tx.trainingEntry.updateMany({
    where: {
      id: entry.id,
      athleteId: job.athleteId,
      version: entry.version,
      evidenceKey: job.evidenceKey,
      evidenceRevision: job.evidenceRevision,
      reviewedAt: null,
      reviewedById: null,
      validationStatus: { in: MUTABLE_AUTOMATIC_STATUSES },
    },
    data: {
      validationStatus: "EXTRACTION_INCOMPLETE",
      version: { increment: 1 },
    },
  });
  if (entryUpdate.count !== 1) return false;

  const proofUpdate = await tx.proofImage.updateMany({
    where: {
      id: { in: job.proofImageIds },
      athleteId: job.athleteId,
      clientSubmissionId: job.clientSubmissionId,
      trainingEntryId: entry.id,
      reviewedById: null,
      validationStatus: { in: MUTABLE_AUTOMATIC_STATUSES },
    },
    data: { validationStatus: "EXTRACTION_INCOMPLETE" },
  });
  if (proofUpdate.count !== job.proofImageIds.length) {
    throw new Error("Evidence changed while the terminal failure was applied.");
  }

  const updatedEntry = await tx.trainingEntry.findUniqueOrThrow({
    where: { id: entry.id },
  });
  await tx.auditLog.create({
    data: {
      actorId: job.athleteId,
      entityType: "TRAINING_ENTRY",
      entityId: entry.id,
      action: "AUTO_VALIDATE",
      before: toInputJsonValue(entry),
      after: toInputJsonValue(updatedEntry),
    },
  });

  if (job.entryId === null) {
    await tx.evidenceExtractionJob.update({
      where: { id: job.id },
      data: { entryId: entry.id },
    });
  }

  return true;
};

export const sanitizeEvidenceWorkerError = (message: string) =>
  compactText(message, 500)
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/(api[_-]?key|token|secret)\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .replace(/https?:\/\/\S+/gi, "[url]");

export const getEvidenceRetryDelayMs = (attempts: number, jitterKey = "") => {
  const baseDelayMs = 60 * 1000 * 2 ** Math.max(0, attempts - 1);
  const stableHash = `${jitterKey}:${attempts}`
    .split("")
    .reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 0);
  const jitterMs = Math.floor(baseDelayMs * ((stableHash % 2_001) / 10_000));
  return Math.min(15 * 60 * 1000, baseDelayMs + jitterMs);
};

const sanitizeMetadata = (metadata: EvidenceExtractionMetadata) => ({
  provider: compactText(metadata.provider, 50),
  model: compactText(metadata.model, 120),
  modelVersion: metadata.modelVersion ? compactText(metadata.modelVersion, 120) : null,
  promptVersion: compactText(metadata.promptVersion, 80),
  schemaVersion: compactText(metadata.schemaVersion, 80),
  durationMs: Math.max(0, Math.trunc(metadata.durationMs)),
  inputTokens:
    metadata.inputTokens === null ? null : Math.max(0, Math.trunc(metadata.inputTokens)),
  outputTokens:
    metadata.outputTokens === null ? null : Math.max(0, Math.trunc(metadata.outputTokens)),
});

export const claimNextEvidenceExtractionJob = async (options?: {
  now?: Date;
  leaseMs?: number;
  jobId?: string;
}) => {
  const now = options?.now ?? new Date();
  const leaseMs = Math.max(1_000, options?.leaseMs ?? EVIDENCE_EXTRACTION_LEASE_MS);
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);
  const claimToken = randomUUID();
  // Prisma binds JavaScript Dates as timestamptz values in raw queries, while
  // these legacy-compatible columns are timestamp-without-time-zone. Normalize
  // explicitly so claim readiness is independent of the database session zone.
  const nowUtc = Prisma.sql`(${now}::timestamptz AT TIME ZONE 'UTC')`;
  const leaseExpiresAtUtc = Prisma.sql`(
    ${leaseExpiresAt}::timestamptz AT TIME ZONE 'UTC'
  )`;
  const jobFilter = options?.jobId
    ? Prisma.sql`AND "id" = ${options.jobId}`
    : Prisma.empty;

  const queueResults = await prisma.$transaction(async (tx) => {
    const results = await tx.$queryRaw<
      Array<EvidenceExtractionJob & { queueAction: "EXHAUSTED" | "CLAIMED" }>
    >`
    WITH exhausted AS (
      UPDATE "EvidenceExtractionJob" AS job
      SET "status" = 'FAILED',
          "leaseExpiresAt" = NULL,
          "claimToken" = NULL,
          "failureCode" = COALESCE("failureCode", 'attempts-exhausted'),
          "lastError" = COALESCE(
            "lastError",
            'Automatic photo checking stopped after three attempts.'
          ),
          "completedAt" = ${nowUtc},
          "updatedAt" = ${nowUtc}
      WHERE "attempts" >= ${MAX_EVIDENCE_EXTRACTION_ATTEMPTS}
        ${jobFilter}
        AND "nextAttemptAt" <= ${nowUtc}
        AND (
          "status" IN ('PENDING', 'NOT_CHECKED')
          OR (
            "status" = 'PROCESSING'
            AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" <= ${nowUtc})
          )
          )
      RETURNING job.*
    ), candidate AS (
      SELECT "id"
      FROM "EvidenceExtractionJob"
      WHERE "attempts" < ${MAX_EVIDENCE_EXTRACTION_ATTEMPTS}
        ${jobFilter}
        AND "nextAttemptAt" <= ${nowUtc}
        AND (
          "status" IN ('PENDING', 'NOT_CHECKED')
          OR (
            "status" = 'PROCESSING'
            AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" <= ${nowUtc})
          )
        )
      ORDER BY "priority" DESC, "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    ), claimed AS (
      UPDATE "EvidenceExtractionJob" AS job
      SET "status" = 'PROCESSING',
          "attempts" = job."attempts" + 1,
          "leaseExpiresAt" = ${leaseExpiresAtUtc},
          "claimToken" = ${claimToken},
          "lastError" = NULL,
          "updatedAt" = ${nowUtc}
      FROM candidate
      WHERE job."id" = candidate."id"
      RETURNING job.*
    )
    SELECT exhausted.*, 'EXHAUSTED'::text AS "queueAction"
    FROM exhausted
    UNION ALL
    SELECT claimed.*, 'CLAIMED'::text AS "queueAction"
    FROM claimed
    `;

    for (const exhausted of results.filter(
      (result) => result.queueAction === "EXHAUSTED",
    )) {
      await applyTerminalFailureToCurrentEntry(tx, exhausted);
    }

    return results;
  });

  const job = queueResults.find((result) => result.queueAction === "CLAIMED");
  if (!job || job.claimToken !== claimToken) return null;
  return job as ClaimedEvidenceExtractionJob;
};

export const getEvidenceProofImages = async (
  job: Pick<
    EvidenceExtractionJob,
    | "id"
    | "athleteId"
    | "claimToken"
    | "clientSubmissionId"
    | "evidenceKey"
    | "evidenceRevision"
    | "entryId"
    | "proofImageIds"
  >,
): Promise<EvidenceProofImage[] | null> => {
  const currentJob = await prisma.evidenceExtractionJob.findFirst({
    where: {
      id: job.id,
      status: "PROCESSING",
      claimToken: job.claimToken,
    },
    select: {
      athleteId: true,
      clientSubmissionId: true,
      evidenceKey: true,
      evidenceRevision: true,
      entryId: true,
      proofImageIds: true,
    },
  });
  if (
    !currentJob ||
    currentJob.athleteId !== job.athleteId ||
    currentJob.clientSubmissionId !== job.clientSubmissionId ||
    currentJob.evidenceKey !== job.evidenceKey ||
    currentJob.evidenceRevision !== job.evidenceRevision ||
    currentJob.proofImageIds.length !== job.proofImageIds.length ||
    currentJob.proofImageIds.some((id, index) => id !== job.proofImageIds[index])
  ) {
    return null;
  }

  const uniqueIds = [...new Set(currentJob.proofImageIds)];
  if (uniqueIds.length === 0 || uniqueIds.length !== currentJob.proofImageIds.length) return null;

  const proofImages = await prisma.proofImage.findMany({
    where: {
      id: { in: uniqueIds },
      athleteId: currentJob.athleteId,
      clientSubmissionId: currentJob.clientSubmissionId,
      uploadedAt: { not: null },
      deletedAt: null,
      verifiedSize: { not: null },
      verifiedMimeType: { not: null },
      contentSha256: { not: null },
    },
    select: {
      id: true,
      storagePath: true,
      trainingEntryId: true,
      verifiedSize: true,
      contentSha256: true,
      trainingEntry: {
        select: {
          athleteId: true,
          evidenceKey: true,
          evidenceRevision: true,
        },
      },
    },
  });

  if (proofImages.length !== uniqueIds.length) return null;

  const proofById = new Map(proofImages.map((proofImage) => [proofImage.id, proofImage]));
  const orderedProofs = currentJob.proofImageIds.map((id) => proofById.get(id));
  if (orderedProofs.some((proofImage) => !proofImage)) return null;
  const completeProofs = orderedProofs as typeof proofImages;

  if (
    currentJob.entryId &&
    completeProofs.some(
      (proofImage) =>
        proofImage.trainingEntryId !== currentJob.entryId,
    )
  ) {
    return null;
  }

  if (
    currentJob.entryId === null &&
    completeProofs.some(
      (proofImage) =>
        proofImage.trainingEntryId !== null &&
        (proofImage.trainingEntry?.athleteId !== currentJob.athleteId ||
          proofImage.trainingEntry.evidenceKey !== currentJob.evidenceKey ||
          proofImage.trainingEntry.evidenceRevision !== currentJob.evidenceRevision),
    )
  ) {
    return null;
  }

  return completeProofs.map(({ id, storagePath, trainingEntryId, verifiedSize, contentSha256 }) => ({
    id,
    storagePath,
    trainingEntryId,
    verifiedSize: verifiedSize as number,
    contentSha256: contentSha256 as string,
  }));
};

export const finalizeEvidenceExtractionJob = async (input: {
  jobId: string;
  claimToken: string;
  evidenceKey: string;
  evidenceRevision: number;
  proofImageIds: string[];
  referenceDate: Date;
  result: EvidenceExtractionResult;
  metadata: EvidenceExtractionMetadata;
  evaluateEntry: (entry: EvidenceEntrySnapshot) => ValidationStatus;
}) => {
  const metadata = sanitizeMetadata(input.metadata);
  const resultJson = input.result as unknown as Prisma.InputJsonValue;
  const resultMeta = {
    modelVersion: metadata.modelVersion,
    inputTokens: metadata.inputTokens,
    outputTokens: metadata.outputTokens,
  } satisfies Prisma.InputJsonObject;
  const completedAt = new Date();

  return prisma.$transaction(async (tx) => {
    const finalized = await tx.evidenceExtractionJob.updateMany({
      where: {
        id: input.jobId,
        status: "PROCESSING",
        claimToken: input.claimToken,
        evidenceKey: input.evidenceKey,
        evidenceRevision: input.evidenceRevision,
        proofImageIds: { equals: input.proofImageIds },
        referenceDate: input.referenceDate,
      },
      data: {
        status: "COMPLETED",
        result: resultJson,
        resultMeta,
        provider: metadata.provider,
        model: metadata.model,
        promptVersion: metadata.promptVersion,
        schemaVersion: metadata.schemaVersion,
        durationMs: metadata.durationMs,
        failureCode: null,
        lastError: null,
        completedAt,
        leaseExpiresAt: null,
        claimToken: null,
        updatedAt: completedAt,
      },
    });

    if (finalized.count !== 1) {
      return { finalized: false, appliedToEntry: false } as const;
    }

    const job = await tx.evidenceExtractionJob.findUnique({
      where: { id: input.jobId },
    });
    if (!job) {
      throw new Error("Finalized evidence job could not be reloaded.");
    }

    const entry = await tx.trainingEntry.findUnique({
      where: { evidenceKey: job.evidenceKey },
      select: {
        id: true,
        athleteId: true,
        activityType: true,
        date: true,
        minutes: true,
        distance: true,
        avgHr: true,
        evidenceRevision: true,
        evidenceKey: true,
        version: true,
        validationStatus: true,
        reviewedAt: true,
        reviewedById: true,
      },
    });

    const matchesCurrentEvidence =
      entry !== null &&
      entry.athleteId === job.athleteId &&
      entry.evidenceKey === job.evidenceKey &&
      entry.evidenceRevision === job.evidenceRevision &&
      (job.entryId === null || job.entryId === entry.id);

    if (
      !entry ||
      !matchesCurrentEvidence ||
      entry.reviewedAt !== null ||
      entry.reviewedById !== null ||
      !MUTABLE_AUTOMATIC_STATUSES.includes(entry.validationStatus)
    ) {
      return { finalized: true, appliedToEntry: false } as const;
    }

    const currentProofs = await tx.proofImage.findMany({
      where: {
        id: { in: job.proofImageIds },
        athleteId: job.athleteId,
        clientSubmissionId: job.clientSubmissionId,
        uploadedAt: { not: null },
        deletedAt: null,
        trainingEntryId: entry.id,
      },
      select: { reviewedById: true, validationStatus: true },
    });
    if (
      currentProofs.length !== job.proofImageIds.length ||
      currentProofs.some(
        (proofImage) =>
          proofImage.reviewedById !== null ||
          !MUTABLE_AUTOMATIC_STATUSES.includes(proofImage.validationStatus),
      )
    ) {
      return { finalized: true, appliedToEntry: false } as const;
    }

    const validationStatus = input.evaluateEntry(entry);
    if (!AUTOMATIC_RESULT_STATUSES.includes(validationStatus)) {
      throw new Error("Automatic evidence evaluation returned a manual-only status.");
    }
    const entryUpdate = await tx.trainingEntry.updateMany({
      where: {
        id: entry.id,
        version: entry.version,
        evidenceKey: job.evidenceKey,
        evidenceRevision: job.evidenceRevision,
        reviewedAt: null,
        reviewedById: null,
        validationStatus: { in: MUTABLE_AUTOMATIC_STATUSES },
      },
      data: {
        validationStatus,
        version: { increment: 1 },
      },
    });

    if (entryUpdate.count !== 1) {
      return { finalized: true, appliedToEntry: false } as const;
    }

    const proofUpdate = await tx.proofImage.updateMany({
      where: {
        id: { in: job.proofImageIds },
        athleteId: job.athleteId,
        reviewedById: null,
        validationStatus: { in: MUTABLE_AUTOMATIC_STATUSES },
      },
      data: {
        extractedFields: resultJson,
        validationStatus,
      },
    });
    if (proofUpdate.count !== job.proofImageIds.length) {
      throw new Error("Evidence changed while the automatic result was applied.");
    }

    const updatedEntry = await tx.trainingEntry.findUniqueOrThrow({
      where: { id: entry.id },
    });
    await tx.auditLog.create({
      data: {
        actorId: job.athleteId,
        entityType: "TRAINING_ENTRY",
        entityId: entry.id,
        action: "AUTO_VALIDATE",
        before: toInputJsonValue(entry),
        after: toInputJsonValue(updatedEntry),
      },
    });

    if (job.entryId === null) {
      await tx.evidenceExtractionJob.update({
        where: { id: job.id },
        data: { entryId: entry.id },
      });
    }

    return { finalized: true, appliedToEntry: true, validationStatus } as const;
  });
};

export const recordEvidenceExtractionFailure = async (input: {
  jobId: string;
  claimToken: string;
  attempts: number;
  retryable: boolean;
  failureCode: string;
  message: string;
  now?: Date;
}) => {
  const now = input.now ?? new Date();
  const shouldRetry =
    input.retryable && input.attempts < MAX_EVIDENCE_EXTRACTION_ATTEMPTS;
  const nextAttemptAt = shouldRetry
    ? new Date(
        now.getTime() +
          getEvidenceRetryDelayMs(input.attempts, input.jobId),
      )
    : now;

  return prisma.$transaction(async (tx) => {
    const result = await tx.evidenceExtractionJob.updateMany({
      where: {
        id: input.jobId,
        status: "PROCESSING",
        claimToken: input.claimToken,
      },
      data: {
        status: shouldRetry ? "PENDING" : "FAILED",
        nextAttemptAt,
        leaseExpiresAt: null,
        claimToken: null,
        failureCode: compactText(input.failureCode, 80),
        lastError: sanitizeEvidenceWorkerError(input.message),
        completedAt: shouldRetry ? null : now,
        updatedAt: now,
      },
    });

    if (result.count !== 1) {
      return {
        recorded: false,
        willRetry: false,
        nextAttemptAt: null,
        appliedToEntry: false,
      } as const;
    }

    let appliedToEntry = false;
    if (!shouldRetry) {
      const job = await tx.evidenceExtractionJob.findUniqueOrThrow({
        where: { id: input.jobId },
      });
      appliedToEntry = await applyTerminalFailureToCurrentEntry(tx, job);
    }

    return {
      recorded: true,
      willRetry: shouldRetry,
      nextAttemptAt: shouldRetry ? nextAttemptAt : null,
      appliedToEntry,
    } as const;
  });
};
