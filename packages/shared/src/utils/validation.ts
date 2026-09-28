import type { ValidationStatus } from "../enums/validation-status";

export const isWorkoutCredited = (entry: {
  validationStatus: ValidationStatus;
  creditPolicyVersion: number;
}) => entry.creditPolicyVersion === 1
  ? entry.validationStatus !== "REJECTED"
  : entry.validationStatus === "VERIFIED";

export type ProofFieldComparison = {
  matches: boolean;
  extractionIncomplete: boolean;
  normalizedProofValue: number | null;
};

export const getSupportedWorkoutMinutes = (fields: {
  durationSeconds?: number | null;
  minutes?: number | null;
}): number | null => {
  if (fields.durationSeconds !== null && fields.durationSeconds !== undefined) {
    return Math.floor(fields.durationSeconds / 60);
  }
  return fields.minutes ?? null;
};

const isMissing = (value: number | null | undefined) => value === null || value === undefined;

const compareOptionalNumber = (
  manualValue: number | null | undefined,
  proofValue: number | null | undefined,
  normalizer?: (value: number) => number,
): ProofFieldComparison => {
  if (isMissing(proofValue)) {
    return { matches: true, extractionIncomplete: true, normalizedProofValue: null };
  }

  const normalizedProofValue = normalizer ? normalizer(proofValue) : proofValue;
  return {
    matches: manualValue === normalizedProofValue,
    extractionIncomplete: false,
    normalizedProofValue,
  };
};

export const truncateDistanceKm = (distanceKm: number) =>
  Math.floor(distanceKm * 10) / 10;

export const compareDistanceKm = (manualKm: number, proofKm?: number | null) =>
  compareOptionalNumber(truncateDistanceKm(manualKm), proofKm, truncateDistanceKm);

export const compareAverageHr = (
  manualHr: number | null | undefined,
  proofHr?: number | null,
) => compareOptionalNumber(manualHr, proofHr);
