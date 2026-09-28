import {
  getSupportedWorkoutMinutes,
  type ActivityType,
  type EvidenceExtractionResult,
  type ProofExtractedFields,
  type ValidationStatus,
  toZonedDateTime,
} from "@rowbook/shared";

export const AUTO_VERIFY_CONFIDENCE = 0.92;

export const isDateMatch = (
  entryDate: Date,
  extractedDateStr: string | null | undefined,
) => {
  if (!extractedDateStr) return false;

  const extractedDate = toZonedDateTime(extractedDateStr);
  if (!extractedDate.isValid) return false;

  return toZonedDateTime(entryDate).hasSame(extractedDate, "day");
};

type EntryForValidation = {
  activityType: ActivityType;
  date: Date;
  minutes: number;
  distance: number;
  avgHr?: number | null;
};

type ExtractedForValidation = ProofExtractedFields &
  Partial<Pick<EvidenceExtractionResult, "confidence" | "isSingleWorkout" | "reviewReason">>;

export type AutoVerificationResult = {
  autoVerified: boolean;
  validationStatus: ValidationStatus;
  reasons: string[];
};

/**
 * Evaluates one canonical evidence-set result. Multiple legacy results are only
 * accepted when they agree; they are never summed because two screenshots may
 * show the same Garmin/Strava or PM5 workout.
 */
export const evaluateAutoVerification = (
  entry: EntryForValidation,
  proofs: Array<ExtractedForValidation | null>,
): AutoVerificationResult => {
  const extracted = proofs.filter(
    (proof): proof is ExtractedForValidation => proof !== null && proof !== undefined,
  );

  if (extracted.length === 0) {
    return {
      autoVerified: false,
      validationStatus: "NOT_CHECKED",
      reasons: ["Workout proof has not been checked yet."],
    };
  }

  const canonical = extracted[0];
  const supportedMinutes = getSupportedWorkoutMinutes(canonical);
  const requiredComplete = extracted.every(
    (proof) => Boolean(proof.date) && getSupportedWorkoutMinutes(proof) !== null,
  );

  if (!requiredComplete || supportedMinutes === null) {
    return {
      autoVerified: false,
      validationStatus: "EXTRACTION_INCOMPLETE",
      reasons: ["The photo did not show the workout date and active duration."],
    };
  }

  const valuesDisagree = extracted.slice(1).some(
    (proof) =>
      proof.date !== canonical.date ||
      getSupportedWorkoutMinutes(proof) !== supportedMinutes,
  );

  const reasons: string[] = [];
  if (valuesDisagree) reasons.push("The photos appear to show different workout totals.");
  if (!isDateMatch(entry.date, canonical.date)) reasons.push("Workout date does not match the photo.");
  if (entry.minutes > supportedMinutes) {
    reasons.push(`Entered minutes exceed the ${supportedMinutes} whole active minutes supported by the photo.`);
  }

  if (extracted.some((proof) => proof.isSingleWorkout === false)) {
    reasons.push("The photos may contain more than one workout.");
  }
  if (
    extracted.some((proof) =>
      proof.confidence !== undefined && proof.confidence < AUTO_VERIFY_CONFIDENCE,
    )
  ) {
    reasons.push("The automatic photo check was not confident enough.");
  }
  for (const proof of extracted) {
    if (proof.reviewReason && !reasons.includes(proof.reviewReason)) {
      reasons.push(proof.reviewReason);
    }
  }

  const autoVerified = reasons.length === 0;
  return {
    autoVerified,
    validationStatus: autoVerified ? "VERIFIED" : "PENDING",
    reasons,
  };
};
