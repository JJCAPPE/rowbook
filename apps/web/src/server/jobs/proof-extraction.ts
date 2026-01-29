import {
  PENDING_PROOF_STATUSES,
  ValidationStatus,
  compareAverageHr,
} from "@rowbook/shared";
import { getProofImageById, updateProofImageIfPending } from "@/server/repositories/proof-images";
import {
  lockNextProofExtractionJob,
  markProofExtractionJobCompleted,
  markProofExtractionJobFailed,
} from "@/server/repositories/proof-extraction-jobs";
import { getTrainingEntryByProofImageId, updateTrainingEntry } from "@/server/repositories/training-entries";
import { downloadFile } from "@/server/storage/proof-storage";
import { extractProofWithGemini } from "@/server/services/proof-extraction-service";

const toBuffer = async (data: unknown) => {
  if (data instanceof Buffer) {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }

  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }

  if (data && typeof (data as Blob).arrayBuffer === "function") {
    const arrayBuffer = await (data as Blob).arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  if (data && typeof (data as ReadableStream).getReader === "function") {
    const arrayBuffer = await new Response(data as ReadableStream).arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  throw new Error("Unsupported proof image payload.");
};

const isSameDate = (left: Date, right: Date) =>
  left.toISOString().slice(0, 10) === right.toISOString().slice(0, 10);

const shouldAutoVerify = (
  entry: {
    date: Date;
    minutes: number;
    distance: number;
    avgHr: number | null;
  } | null,
  extracted: {
    date: string | null;
    minutes: number | null;
    distance: number | null;
    avgHr: number | null;
  },
) => {
  if (!entry || !extracted.date || extracted.minutes === null || extracted.distance === null) {
    return false;
  }

  const parsedDate = new Date(extracted.date);
  if (Number.isNaN(parsedDate.getTime())) {
    return false;
  }

  const minutesMatch = extracted.minutes >= entry.minutes;
  const distanceMatch = extracted.distance >= entry.distance;
  const dateMatch = isSameDate(entry.date, parsedDate);
  const hrMatch = entry.avgHr === null
    ? true
    : extracted.avgHr !== null && compareAverageHr(entry.avgHr, extracted.avgHr).matches;

  return minutesMatch && distanceMatch && dateMatch && hrMatch;
};

const resolveValidationStatus = (
  hasRequired: boolean,
  autoVerified: boolean,
): ValidationStatus => {
  if (autoVerified) {
    return "VERIFIED";
  }

  return hasRequired ? "PENDING" : "EXTRACTION_INCOMPLETE";
};

const processJob = async (jobId: string, proofImageId: string) => {
  const proofImage = await getProofImageById(proofImageId);
  if (!proofImage) {
    await markProofExtractionJobFailed(jobId, "Proof image not found.");
    return { proofImageId, status: "FAILED", reason: "missing" };
  }

  if (proofImage.validationStatus === "VERIFIED" || proofImage.validationStatus === "REJECTED") {
    await markProofExtractionJobFailed(jobId, "Manual review already completed.");
    return { proofImageId, status: "SKIPPED", reason: "reviewed" };
  }

  if (!proofImage.uploadedAt) {
    await markProofExtractionJobFailed(jobId, "Proof image upload incomplete.");
    return { proofImageId, status: "FAILED", reason: "upload" };
  }

  const file = await downloadFile(proofImage.storagePath);
  const buffer = await toBuffer(file);
  
  let extractedData;
  try {
    extractedData = await extractProofWithGemini(buffer);
  } catch (error) {
     const message = error instanceof Error ? error.message : "Gemini extraction failed";
     await markProofExtractionJobFailed(jobId, message);
     return { proofImageId, status: "FAILED", reason: "extraction_error" };
  }

  const { date, minutes, distance, avgHr, confidence, rejectionReason } = extractedData;

  const extractedFields = {
    date,
    minutes,
    distance,
    avgHr,
    rejectionReason,
    activityType: null,
  };

  // If confidence is extremely low, we might not extract anything useful.
  // But let's rely on hasAny checks.
  const hasAny = [date, minutes, distance, avgHr].some((value) => value !== null && value !== undefined);

  if (!hasAny) {
    await markProofExtractionJobFailed(jobId, "No extractable data found.");
    return { proofImageId, status: "FAILED", reason: "empty" };
  }

  const entry = await getTrainingEntryByProofImageId(proofImageId);
  const autoVerified = shouldAutoVerify(entry, {
    date: extractedFields.date ?? null,
    minutes: extractedFields.minutes ?? null,
    distance: extractedFields.distance ?? null,
    avgHr: extractedFields.avgHr ?? null,
  });
  
  // We can also use confidence to require manual review even if fields match
  // e.g. if (autoVerified && confidence < 0.8) autoVerified = false;
  // For now, let's trust the data match.

  const hasRequired = Boolean(extractedFields.date)
    && extractedFields.minutes !== null
    && extractedFields.minutes !== undefined
    && extractedFields.distance !== null
    && extractedFields.distance !== undefined;

  const validationStatus = resolveValidationStatus(hasRequired, autoVerified);

  const updateResult = await updateProofImageIfPending(proofImageId, {
    extractedFields,
    validationStatus,
  });

  if (updateResult.count === 0) {
    await markProofExtractionJobFailed(jobId, "Manual review already completed.");
    return { proofImageId, status: "SKIPPED", reason: "reviewed" };
  }

  if (entry && PENDING_PROOF_STATUSES.has(entry.validationStatus)) {
    await updateTrainingEntry(entry.id, { validationStatus });
  }

  await markProofExtractionJobCompleted(jobId);
  return { proofImageId, status: "COMPLETED", validationStatus };
};

export const runProofExtraction = async (options?: { maxJobs?: number }) => {
  const maxJobs = options?.maxJobs ?? 1;
  const results: Array<Record<string, unknown>> = [];

  for (let index = 0; index < maxJobs; index += 1) {
    const job = await lockNextProofExtractionJob();
    if (!job) {
      break;
    }

    try {
      const result = await processJob(job.id, job.proofImageId);
      results.push(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error.";
      await markProofExtractionJobFailed(job.id, message);
      results.push({ proofImageId: job.proofImageId, status: "FAILED", reason: "error" });
    }
  }

  return { processed: results.length, results };
};
