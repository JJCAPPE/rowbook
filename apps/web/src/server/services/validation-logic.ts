import { ValidationStatus, toZonedDateTime } from "@rowbook/shared";

export const isDateMatch = (entryDate: Date, extractedDateStr: string | null | undefined) => {
    if (!extractedDateStr) return false;
    
    // Extracted date is just "YYYY-MM-DD", toZonedDateTime will treat it as midnight in America/New_York
    const extractedDate = toZonedDateTime(extractedDateStr);
    if (!extractedDate.isValid) return false;

    // Both are now effectively in America/New_York
    const entryDateZoned = toZonedDateTime(entryDate);
    
    return entryDateZoned.hasSame(extractedDate, "day");
};

export const evaluateAutoVerification = (
  entry: { date: Date; minutes: number },
  proofs: Array<{ date: string | null; minutes: number | null } | null>
): { autoVerified: boolean; validationStatus: ValidationStatus } => {
  if (proofs.length === 0) {
    return { autoVerified: false, validationStatus: "NOT_CHECKED" };
  }

  // Check if all proofs have been processed/extracted
  // Note: We intentionally ignore distance matching/presence. Only Date and Minutes are required.
  const allExtracted = proofs.every((p) => p !== null && p !== undefined && p.date !== null && p.minutes !== null);
  if (!allExtracted) {
    return { autoVerified: false, validationStatus: "PENDING" };
  }

  // Aggregate
  const totals = proofs.reduce((acc, curr) => {
    if (!curr) return acc;
    return {
      minutes: acc.minutes + (curr.minutes ?? 0),
      // We assume they all belong to the same date for now, or we check each
    };
  }, { minutes: 0 });

  // Evaluation criteria
  const minutesMatch = totals.minutes >= (entry.minutes - 1);
  const dateMatch = proofs.every((p) => isDateMatch(entry.date, p?.date));

  const autoVerified = minutesMatch && dateMatch;

  return {
    autoVerified,
    validationStatus: autoVerified ? "VERIFIED" : "PENDING",
  };
};
