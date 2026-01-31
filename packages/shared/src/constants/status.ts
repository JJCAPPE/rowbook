import { ValidationStatus } from "../enums/validation-status";

export type ValidationStatusTone = "neutral" | "pending" | "success" | "danger" | "info";

export const VALIDATION_STATUS_UI: Record<
  ValidationStatus,
  { label: string; tone: ValidationStatusTone }
> = {
  NOT_CHECKED: { label: "Pending Review", tone: "neutral" },
  PENDING: { label: "Pending Review", tone: "neutral" },
  VERIFIED: { label: "Valid", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
  EXTRACTION_INCOMPLETE: { label: "Pending Review", tone: "neutral" },
};

export const VALIDATION_STATUS_LABELS: Record<ValidationStatus, string> = {
  NOT_CHECKED: "Pending Review",
  PENDING: "Pending Review",
  VERIFIED: "Valid",
  REJECTED: "Rejected",
  EXTRACTION_INCOMPLETE: "Pending Review",
};

export const PENDING_PROOF_STATUSES = new Set<ValidationStatus>([
  "NOT_CHECKED",
  "PENDING",
  "EXTRACTION_INCOMPLETE",
]);
