import {
  compareAverageHr,
  compareDistanceKm,
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

const distanceIsRequired = (activityType: ActivityType) => activityType !== "OTHER";

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
  const requiredComplete =
    Boolean(canonical.date) &&
    canonical.minutes !== null &&
    canonical.minutes !== undefined &&
    (!distanceIsRequired(entry.activityType) ||
      (canonical.distance !== null && canonical.distance !== undefined));

  if (!requiredComplete) {
    return {
      autoVerified: false,
      validationStatus: "EXTRACTION_INCOMPLETE",
      reasons: ["The photo did not show every required workout value."],
    };
  }

  const valuesDisagree = extracted.slice(1).some(
    (proof) =>
      proof.date !== canonical.date ||
      proof.minutes !== canonical.minutes ||
      (proof.distance ?? null) !== (canonical.distance ?? null),
  );

  const reasons: string[] = [];
  if (valuesDisagree) reasons.push("The photos appear to show different workout totals.");
  if (!isDateMatch(entry.date, canonical.date)) reasons.push("Workout date does not match the photo.");
  if (canonical.minutes !== entry.minutes) reasons.push("Workout minutes do not match the photo.");

  if (
    distanceIsRequired(entry.activityType) &&
    !compareDistanceKm(entry.distance, canonical.distance).matches
  ) {
    reasons.push("Workout distance does not match the photo at 0.1 km precision.");
  }

  if (
    entry.avgHr !== null &&
    entry.avgHr !== undefined &&
    canonical.avgHr !== null &&
    canonical.avgHr !== undefined &&
    !compareAverageHr(entry.avgHr, canonical.avgHr).matches
  ) {
    reasons.push("Average heart rate does not match the photo.");
  }

  if (canonical.activityType && canonical.activityType !== entry.activityType) {
    reasons.push("Activity type does not match the photo.");
  }
  if (canonical.isSingleWorkout === false) {
    reasons.push("The photos may contain more than one workout.");
  }
  if (
    canonical.confidence !== undefined &&
    canonical.confidence < AUTO_VERIFY_CONFIDENCE
  ) {
    reasons.push("The automatic photo check was not confident enough.");
  }
  if (canonical.reviewReason && !reasons.includes(canonical.reviewReason)) {
    reasons.push(canonical.reviewReason);
  }

  const autoVerified = reasons.length === 0;
  return {
    autoVerified,
    validationStatus: autoVerified ? "VERIFIED" : "PENDING",
    reasons,
  };
};
