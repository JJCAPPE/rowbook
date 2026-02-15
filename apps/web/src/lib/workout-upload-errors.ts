import { MAX_UPLOAD_SIZE_BYTES } from "@rowbook/shared";

type WorkoutErrorStage = "upload" | "extract" | "submit";

type ZodIssue = {
  path?: Array<string | number>;
  message?: string;
};

const MAX_UPLOAD_SIZE_MB = Math.round(MAX_UPLOAD_SIZE_BYTES / (1024 * 1024));

const STAGE_DEFAULT_MESSAGES: Record<WorkoutErrorStage, string> = {
  upload: `Could not upload proof image. Use JPG, PNG, or WEBP up to ${MAX_UPLOAD_SIZE_MB} MB, then try again.`,
  extract:
    "Could not auto-read this screenshot. Enter details manually and submit.",
  submit: "Could not submit workout. Review your fields and try again.",
};

const EXACT_MESSAGE_MAP: Record<string, string> = {
  "File exceeds maximum size.": `Image is too large. Maximum size is ${MAX_UPLOAD_SIZE_MB} MB.`,
  "Unsupported file type.": "Unsupported image format. Use JPG, PNG, or WEBP.",
  "Failed to upload proof image.":
    "Proof image upload failed. Check your connection and try again.",
  "Upload cancelled.": "Proof image upload was cancelled.",
  "Proof image not found.":
    "That proof image could not be found. Please upload it again.",
  "Access denied.": "You do not have permission to use that proof image.",
  "Failed to create upload URL.": "Could not start image upload. Please try again.",
  "Failed to download proof image.":
    "Could not read that proof image. Please upload it again.",
  "Entry date must be within the active week.":
    "Workout date must be inside the current challenge week.",
  "Entry date cannot be in the future.": "Workout date cannot be in the future.",
  "At least one proof image is required.":
    "Upload at least one proof image before submitting.",
  "Duplicate proof images are not allowed.":
    "Remove duplicate proof images and try again.",
  "One or more proof images are invalid for this athlete.":
    "One or more proof images are invalid. Please re-upload and try again.",
  "All proof images must be uploaded before submitting.":
    "Wait for image upload to finish before submitting.",
};

const ISSUE_PATH_MESSAGES: Record<string, string> = {
  fileName: "Could not read this image file. Please choose another screenshot.",
  fileSize: `Image is too large. Maximum size is ${MAX_UPLOAD_SIZE_MB} MB.`,
  mimeType: "Unsupported image format. Use JPG, PNG, or WEBP.",
  activityType: "Choose an activity type.",
  date: "Choose a valid workout date that is not in the future.",
  minutes: "Enter workout minutes greater than 0.",
  distance: "Enter workout distance greater than 0 km.",
  avgHr: "Average heart rate must be greater than 0.",
  proofImageIds: "Upload at least one proof image before submitting.",
  notes: "Notes are too long.",
  "proofOcr.extractedFields.date":
    "Auto-read date was invalid. Check the Date field and submit again.",
  "proofOcr.extractedFields.minutes":
    "Auto-read minutes were invalid. Check the Minutes field and submit again.",
  "proofOcr.extractedFields.distance":
    "Auto-read distance was invalid. Check the Distance field and submit again.",
  "proofOcr.extractedFields.avgHr":
    "Auto-read heart rate was invalid. Check the Average HR field and submit again.",
};

const SAFE_SUBSTRING_MESSAGES: Array<[string, string]> = [
  ["gemini api", STAGE_DEFAULT_MESSAGES.extract],
  ["server configuration error", STAGE_DEFAULT_MESSAGES.extract],
  ["unsupported proof image payload", STAGE_DEFAULT_MESSAGES.extract],
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getErrorMessage = (error: unknown): string | null => {
  if (!isRecord(error)) {
    return null;
  }

  const direct = error.message;
  if (typeof direct === "string" && direct.trim().length > 0) {
    return direct.trim();
  }

  const shape = error.shape as { message?: unknown } | undefined;
  if (typeof shape?.message === "string" && shape.message.trim().length > 0) {
    return shape.message.trim();
  }

  return null;
};

const getErrorCode = (error: unknown): string | null => {
  if (!isRecord(error)) {
    return null;
  }

  const directData = error.data as { code?: unknown } | undefined;
  if (typeof directData?.code === "string") {
    return directData.code;
  }

  const shape = error.shape as { data?: { code?: unknown } } | undefined;
  if (typeof shape?.data?.code === "string") {
    return shape.data.code;
  }

  return null;
};

const isZodIssue = (value: unknown): value is ZodIssue =>
  isRecord(value) && Array.isArray(value.path);

const parseIssuesFromMessage = (message: string): ZodIssue[] | null => {
  const trimmed = message.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      return null;
    }
    const issues = parsed.filter(isZodIssue);
    return issues.length > 0 ? issues : null;
  } catch {
    return null;
  }
};

const mapIssueToMessage = (issue: ZodIssue): string | null => {
  const pathKey = (issue.path ?? []).map(String).join(".");
  if (pathKey in ISSUE_PATH_MESSAGES) {
    return ISSUE_PATH_MESSAGES[pathKey] as string;
  }

  if (pathKey.startsWith("proofOcr.extractedFields")) {
    return "Auto-read screenshot values were invalid. Check the form fields and submit again.";
  }

  if (typeof issue.message === "string" && issue.message.trim().length > 0) {
    if (issue.message === "Required" || issue.message === "Invalid input") {
      return null;
    }
    return issue.message;
  }

  return null;
};

const mapZodIssuesToMessage = (
  issues: ZodIssue[],
  stage: WorkoutErrorStage,
): string => {
  const messages = Array.from(
    new Set(
      issues
        .map(mapIssueToMessage)
        .filter((message): message is string => Boolean(message)),
    ),
  );

  if (messages.length > 0) {
    return messages.join(" ");
  }

  return STAGE_DEFAULT_MESSAGES[stage];
};

export const getWorkoutUploadErrorMessage = (
  error: unknown,
  stage: WorkoutErrorStage,
): string => {
  const code = getErrorCode(error);
  if (code === "UNAUTHORIZED") {
    return "Your session expired. Log in again and retry.";
  }
  if (code === "FORBIDDEN") {
    return "You do not have permission to submit this workout.";
  }
  if (code === "PAYLOAD_TOO_LARGE") {
    return `Image is too large. Maximum size is ${MAX_UPLOAD_SIZE_MB} MB.`;
  }

  const message = getErrorMessage(error);
  if (!message) {
    return STAGE_DEFAULT_MESSAGES[stage];
  }

  const issues = parseIssuesFromMessage(message);
  if (issues) {
    return mapZodIssuesToMessage(issues, stage);
  }

  const exactMapped = EXACT_MESSAGE_MAP[message];
  if (exactMapped) {
    return exactMapped;
  }

  const lower = message.toLowerCase();
  const substringMatch = SAFE_SUBSTRING_MESSAGES.find(([needle]) =>
    lower.includes(needle),
  );
  if (substringMatch) {
    return substringMatch[1];
  }

  if (stage === "extract") {
    return STAGE_DEFAULT_MESSAGES.extract;
  }

  return STAGE_DEFAULT_MESSAGES[stage];
};
