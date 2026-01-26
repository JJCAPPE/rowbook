import { ValidationStatus } from "../enums/validation-status";

export type ValidationStatusTone = "neutral" | "pending" | "success" | "danger" | "info";

export const VALIDATION_STATUS_UI: Record<
  ValidationStatus,
  { label: string; tone: ValidationStatusTone }
> = {
  NOT_CHECKED: { label: "Valid (pending review)", tone: "success" },
  PENDING: { label: "Valid (pending review)", tone: "success" },
  VERIFIED: { label: "Verified", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
  EXTRACTION_INCOMPLETE: { label: "Valid (pending review)", tone: "success" },
};

export const VALIDATION_STATUS_LABELS: Record<ValidationStatus, string> = {
  NOT_CHECKED: "Valid (pending review)",
  PENDING: "Valid (pending review)",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
  EXTRACTION_INCOMPLETE: "Valid (pending review)",
};

export const PENDING_PROOF_STATUSES = new Set<ValidationStatus>([
  "NOT_CHECKED",
  "PENDING",
  "EXTRACTION_INCOMPLETE",
]);
