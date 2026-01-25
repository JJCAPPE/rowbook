import { ValidationStatus } from "../enums/validation-status";

export type ValidationStatusTone = "neutral" | "pending" | "success" | "danger" | "info";

export const VALIDATION_STATUS_UI: Record<
  ValidationStatus,
  { label: string; tone: ValidationStatusTone }
> = {
  NOT_CHECKED: { label: "Not checked", tone: "neutral" },
  PENDING: { label: "Pending review", tone: "pending" },
  VERIFIED: { label: "Verified", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
  EXTRACTION_INCOMPLETE: { label: "Extraction incomplete", tone: "info" },
};

export const VALIDATION_STATUS_LABELS: Record<ValidationStatus, string> = {
  NOT_CHECKED: "Not checked",
  PENDING: "Pending review",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
  EXTRACTION_INCOMPLETE: "Extraction incomplete",
};
