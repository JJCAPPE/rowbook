import {
  compareAverageHr,
  compareDistanceKm,
  formatInTimeZone,
  type ActivityType,
  type ProofExtractedFields,
} from "@rowbook/shared";

export type EnteredWorkoutFields = {
  activityType: ActivityType;
  date: Date;
  minutes: number;
  distance: number;
  avgHr: number | null;
};

export type ProofComparisonStatus = "matches" | "differs" | "missing";

export type ProofFieldComparisonStatuses = Record<
  "activityType" | "date" | "minutes" | "distance" | "avgHr",
  ProofComparisonStatus
>;

const statusFor = (isMissing: boolean, matches: boolean) =>
  isMissing ? "missing" : matches ? "matches" : "differs";

export const getExtractedMinutes = (fields: ProofExtractedFields) => {
  if (typeof fields.minutes === "number") return fields.minutes;
  if (typeof fields.durationSeconds !== "number") return null;
  return Math.max(1, Math.round(fields.durationSeconds / 60));
};

export const compareProofFields = (
  entered: EnteredWorkoutFields,
  extracted: ProofExtractedFields,
): ProofFieldComparisonStatuses => {
  const extractedMinutes = getExtractedMinutes(extracted);
  const distance = compareDistanceKm(entered.distance, extracted.distance);
  const avgHr = compareAverageHr(entered.avgHr, extracted.avgHr);

  return {
    activityType: statusFor(
      extracted.activityType == null,
      extracted.activityType === entered.activityType,
    ),
    date: statusFor(
      extracted.date == null,
      extracted.date != null &&
        formatInTimeZone(extracted.date) === formatInTimeZone(entered.date),
    ),
    minutes: statusFor(
      extractedMinutes == null,
      extractedMinutes === entered.minutes,
    ),
    distance: statusFor(
      distance.extractionIncomplete,
      distance.matches && !distance.extractionIncomplete,
    ),
    avgHr: statusFor(
      avgHr.extractionIncomplete,
      avgHr.matches && !avgHr.extractionIncomplete,
    ),
  };
};
