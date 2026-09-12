import { createHash } from "node:crypto";

import { EvidenceExtractionResultSchema } from "@rowbook/shared";

import {
  claimNextEvidenceExtractionJob,
  finalizeEvidenceExtractionJob,
  getEvidenceProofImages,
  recordEvidenceExtractionFailure,
  type ClaimedEvidenceExtractionJob,
} from "@/server/repositories/evidence-extraction-jobs";
import {
  extractProofWithGeminiBatch,
  ProofExtractionError,
} from "@/server/services/proof-extraction-service";
import { evaluateAutoVerification } from "@/server/services/validation-logic";
import { downloadFile } from "@/server/storage/proof-storage";

class EvidenceWorkerError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "EvidenceWorkerError";
  }
}

const toBuffer = async (data: unknown) => {
  if (data instanceof Buffer) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  if (data && typeof (data as Blob).arrayBuffer === "function") {
    return Buffer.from(await (data as Blob).arrayBuffer());
  }
  if (data && typeof (data as ReadableStream).getReader === "function") {
    return Buffer.from(
      await new Response(data as ReadableStream).arrayBuffer(),
    );
  }

  throw new EvidenceWorkerError(
    "invalid-storage-payload",
    "A workout photo could not be read from storage.",
    false,
  );
};

const classifyWorkerError = (error: unknown) => {
  if (error instanceof EvidenceWorkerError) return error;
  if (error instanceof ProofExtractionError) {
    return new EvidenceWorkerError(error.code, error.message, error.retryable);
  }

  return new EvidenceWorkerError(
    "worker-unavailable",
    "Automatic photo checking could not finish and will retry.",
    true,
  );
};

const downloadEvidenceSet = async (job: ClaimedEvidenceExtractionJob) => {
  const proofImages = await getEvidenceProofImages(job);
  if (!proofImages) {
    throw new EvidenceWorkerError(
      "invalid-evidence-set",
      "The workout evidence set is incomplete or no longer available.",
      false,
    );
  }

  try {
    return await Promise.all(
      proofImages.map(async (proofImage) => {
        const buffer = await toBuffer(
          await downloadFile(proofImage.storagePath),
        );
        const contentSha256 = createHash("sha256").update(buffer).digest("hex");
        if (
          buffer.byteLength !== proofImage.verifiedSize ||
          contentSha256 !== proofImage.contentSha256.toLowerCase()
        ) {
          throw new EvidenceWorkerError(
            "storage-object-mismatch",
            "A workout photo no longer matches its confirmed upload.",
            false,
          );
        }
        return buffer;
      }),
    );
  } catch (error) {
    if (error instanceof EvidenceWorkerError) throw error;
    throw new EvidenceWorkerError(
      "storage-unavailable",
      "A workout photo could not be downloaded and will retry.",
      true,
    );
  }
};

const processEvidenceExtractionJob = async (
  job: ClaimedEvidenceExtractionJob,
) => {
  try {
    const imageBuffers = await downloadEvidenceSet(job);
    const extraction = await extractProofWithGeminiBatch(imageBuffers, {
      referenceDate: job.referenceDate,
    });
    const parsed = EvidenceExtractionResultSchema.safeParse(extraction);
    if (!parsed.success) {
      throw new EvidenceWorkerError(
        "invalid-response",
        "The photo check returned incomplete data and needs manual review.",
        false,
      );
    }
    const result = parsed.data;

    const finalized = await finalizeEvidenceExtractionJob({
      jobId: job.id,
      claimToken: job.claimToken,
      evidenceKey: job.evidenceKey,
      evidenceRevision: job.evidenceRevision,
      proofImageIds: job.proofImageIds,
      referenceDate: job.referenceDate,
      result,
      metadata: extraction.metadata,
      evaluateEntry: (entry) =>
        evaluateAutoVerification(
          {
            activityType: entry.activityType,
            date: entry.date,
            minutes: entry.minutes,
            distance: entry.distance,
            avgHr: entry.avgHr,
          },
          [result],
        ).validationStatus,
    });

    if (!finalized.finalized) {
      return {
        evidenceKey: job.evidenceKey,
        status: "SKIPPED",
        reason: "lost-claim",
      } as const;
    }

    return {
      evidenceKey: job.evidenceKey,
      status: "COMPLETED",
      appliedToEntry: finalized.appliedToEntry,
      ...(finalized.appliedToEntry
        ? { validationStatus: finalized.validationStatus }
        : {}),
    } as const;
  } catch (error) {
    const failure = classifyWorkerError(error);
    const recorded = await recordEvidenceExtractionFailure({
      jobId: job.id,
      claimToken: job.claimToken,
      attempts: job.attempts,
      retryable: failure.retryable,
      failureCode: failure.code,
      message: failure.message,
    });

    if (!recorded.recorded) {
      return {
        evidenceKey: job.evidenceKey,
        status: "SKIPPED",
        reason: "lost-claim",
      } as const;
    }

    return {
      evidenceKey: job.evidenceKey,
      status: recorded.willRetry ? "RETRYING" : "FAILED",
      failureCode: failure.code,
      ...(recorded.nextAttemptAt
        ? { nextAttemptAt: recorded.nextAttemptAt.toISOString() }
        : {}),
    } as const;
  }
};

/**
 * Processes durable V2 evidence jobs. The signature remains compatible with
 * the existing cron route while concurrent invocations safely share the queue.
 */
export const MAX_PROOF_EXTRACTION_JOBS_PER_RUN = 100;

export const runProofExtraction = async (options?: {
  maxJobs?: number;
  jobId?: string;
  claimWindowMs?: number;
}) => {
  const requestedJobs = options?.jobId ? 1 : (options?.maxJobs ?? 1);
  const maxJobs = Number.isFinite(requestedJobs)
    ? Math.min(
        MAX_PROOF_EXTRACTION_JOBS_PER_RUN,
        Math.max(1, Math.trunc(requestedJobs)),
      )
    : 1;
  const claimDeadline =
    options?.claimWindowMs === undefined
      ? Number.POSITIVE_INFINITY
      : Date.now() + Math.max(0, options.claimWindowMs);
  const results: Array<Record<string, unknown>> = [];
  let nextClaim = 0;
  const workerCount = options?.jobId ? 1 : Math.min(4, maxJobs);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextClaim < maxJobs) {
        if (Date.now() >= claimDeadline) break;
        nextClaim += 1;
        const job = await claimNextEvidenceExtractionJob({
          jobId: options?.jobId,
        });
        if (!job) break;
        results.push(await processEvidenceExtractionJob(job));
      }
    }),
  );

  return { processed: results.length, results };
};
