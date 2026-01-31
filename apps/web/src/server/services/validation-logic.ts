
import { ValidationStatus } from "@rowbook/shared";

export const isDateMatch = (entryDate: Date, extractedDateStr: string | null | undefined) => {
    if (!extractedDateStr) return false;
    
    const extractedDate = new Date(extractedDateStr); // UTC Midnight
    if (Number.isNaN(extractedDate.getTime())) return false;

    const entryTime = entryDate.getTime();
    // Earliest valid time: Extracted Date 00:00 UTC minus 14 hours (start of day in UTC+14)
    const startWindow = extractedDate.getTime() - (14 * 60 * 60 * 1000);
    // Latest valid time: Extracted Date 23:59 UTC plus 12 hours (end of day in UTC-12)
    // roughly extractedDate + 36h
    const endWindow = extractedDate.getTime() + (36 * 60 * 60 * 1000);
    
    return entryTime >= startWindow && entryTime <= endWindow;
};

export const evaluateAutoVerification = (
  entry: { date: Date; minutes: number },
  proofs: Array<{ date: string | null; minutes: number | null } | null>
): { autoVerified: boolean; validationStatus: ValidationStatus } => {
  if (proofs.length === 0) {
    return { autoVerified: false, validationStatus: "NOT_CHECKED" };
  }

  // Check if all proofs have been processed/extracted
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
