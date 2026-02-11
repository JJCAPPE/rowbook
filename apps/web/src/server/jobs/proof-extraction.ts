import {
  getProofImageById,
  updateProofImageIfPending,
  updateProofImagesByEntryId,
} from "@/server/repositories/proof-images";
import {
  lockNextProofExtractionJob,
  markProofExtractionJobCompleted,
  markProofExtractionJobFailed,
} from "@/server/repositories/proof-extraction-jobs";
import { getTrainingEntryByProofImageId, updateTrainingEntry } from "@/server/repositories/training-entries";
import { downloadFile } from "@/server/storage/proof-storage";
import { extractProofWithGemini } from "@/server/services/proof-extraction-service";
import { evaluateAutoVerification } from "@/server/services/validation-logic";

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

const processJob = async (jobId: string, proofImageId: string) => {
  const proofImage = await getProofImageById(proofImageId);
  if (!proofImage) {
    await markProofExtractionJobFailed(jobId, "Proof image not found.");
    return { proofImageId, status: "FAILED", reason: "missing" };
  }

  const alreadyManuallyReviewed =
    proofImage.reviewedById !== null || proofImage.validationStatus === "REJECTED";
  if (alreadyManuallyReviewed) {
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
     const message = error instanceof Error ? error.message : "AI Extraction failed";
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
    validationStatus: extractedFields.date ? "PENDING" : "EXTRACTION_INCOMPLETE",
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
      return p.extractedFields as any;
    });
    
    const { autoVerified, validationStatus: entryValidationStatus } = evaluateAutoVerification(
      { date: entry.date, minutes: entry.minutes },
      proofsState
    );

    const hasManualReview = allProofs.some((proof: any) => proof.reviewedById !== null);
    if (!hasManualReview) {
      if (
        entry.validationStatus !== entryValidationStatus &&
        entry.validationStatus !== "REJECTED"
      ) {
        await updateTrainingEntry(entry.id, { validationStatus: entryValidationStatus });
      }

      // If all proof images now satisfy the aggregate check, keep all proofs in sync.
      if (autoVerified) {
        await updateProofImagesByEntryId(entry.id, {
          validationStatus: "VERIFIED",
          reviewedById: null,
        });
      }
    }
  }

  await markProofExtractionJobCompleted(jobId);
  // We return status of THIS job
  return { proofImageId, status: "COMPLETED", validationStatus: "PENDING" }; 
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
