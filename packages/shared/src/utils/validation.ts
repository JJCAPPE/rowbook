export type ProofFieldComparison = {
  matches: boolean;
  extractionIncomplete: boolean;
  normalizedProofValue: number | null;
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
  compareOptionalNumber(manualKm, proofKm, truncateDistanceKm);

export const compareAverageHr = (
  manualHr: number | null | undefined,
  proofHr?: number | null,
) => compareOptionalNumber(manualHr, proofHr);
