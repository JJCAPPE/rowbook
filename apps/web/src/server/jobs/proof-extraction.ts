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
  if (!entry || !extracted.date || extracted.minutes === null) {
    return false;
  }

  const parsedDate = new Date(extracted.date);
  if (Number.isNaN(parsedDate.getTime())) {
    return false;
  }

  const minutesMatch = extracted.minutes >= entry.minutes;
  const dateMatch = isSameDate(entry.date, parsedDate);

  return minutesMatch && dateMatch;
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

  // Trust the data match for now.
  
  // Update the proof image with extracted data
  const updateResult = await updateProofImageIfPending(proofImageId, {
    extractedFields,
    validationStatus: resolveValidationStatus(Boolean(extractedFields.date), false), // Mark as PENDING initially, verified by aggregation below
  });

  if (updateResult.count === 0) {
    await markProofExtractionJobFailed(jobId, "Manual review already completed.");
    return { proofImageId, status: "SKIPPED", reason: "reviewed" };
  }

  // Aggregate and Verify Entry
  const entry = await getTrainingEntryByProofImageId(proofImageId);
  
  if (entry) {
    const allProofs = (entry as any).proofImages ?? []; // Should be populated by include
    
    // Combine current result with others
    const proofsState = allProofs.map((p: any) => {
      if (p.id === proofImageId) {
         return extractedFields;
      }
      return p.extractedFields as typeof extractedFields | null;
    });
    
    // Check if all proofs have data
    const allExtracted = proofsState.every((p: any) => p !== null && p !== undefined);
    
    if (allExtracted) {
       // Aggregate
       const totals = proofsState.reduce((acc: any, curr: any) => {
         if (!curr) return acc;
         return {
            minutes: acc.minutes + (curr.minutes ?? 0),
            distance: acc.distance + (curr.distance ?? 0),
            hrSum: acc.hrSum + ((curr.avgHr ?? 0) * (curr.minutes ?? 0)),
            hrMinutes: acc.hrMinutes + (curr.minutes ?? 0),
            date: curr.date, // Just take last one or check consistency
         };
       }, { minutes: 0, distance: 0, hrSum: 0, hrMinutes: 0, date: null as string | null });
       
       // Verification Logic
       // Check dates consistency
       
       // Allow for small tolerance in minutes (e.g. 91.5 vs 92)
       const minutesMatch = totals.minutes >= (entry.minutes - 1);

       // Flexible Date Match: Check if entry date matches extracted date in ANY timezone.
       // We accept if entry timestamp is within [ExtractedDayStartUTC - 14h, ExtractedDayEndUTC + 12h]
       // This covers UTC+14 to UTC-12.
       const dateMatch = proofsState.every((p: any) => {
           if (!p?.date) return false;
           
           const extractedDate = new Date(p.date); // UTC Midnight
           if (Number.isNaN(extractedDate.getTime())) return false;

           const entryTime = entry.date.getTime();
           // Earliest valid time: Extracted Date 00:00 UTC minus 14 hours (start of day in UTC+14)
           const startWindow = extractedDate.getTime() - (14 * 60 * 60 * 1000);
           // Latest valid time: Extracted Date 23:59 UTC plus 12 hours (end of day in UTC-12)
           // roughly extractedDate + 36h
           const endWindow = extractedDate.getTime() + (36 * 60 * 60 * 1000);
           
           return entryTime >= startWindow && entryTime <= endWindow;
       });
       
       const autoVerified = minutesMatch && dateMatch;
       
       const entryValidationStatus = autoVerified ? "VERIFIED" : "PENDING";
       
       if (PENDING_PROOF_STATUSES.has(entry.validationStatus)) {
         await updateTrainingEntry(entry.id, { validationStatus: entryValidationStatus as ValidationStatus });
       }
    }
  }

  await markProofExtractionJobCompleted(jobId);
  // We return status of THIS job
  return { proofImageId, status: "COMPLETED", validationStatus: "PENDING" }; // Pending until aggregation decides entry status
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
