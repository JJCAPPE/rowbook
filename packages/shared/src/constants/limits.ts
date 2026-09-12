export const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const PROOF_RETENTION_DAYS = 7;
export const MAX_PROOF_IMAGE_SIZE_BYTES = MAX_UPLOAD_SIZE_BYTES;
export const MAX_PROOF_FILES = 6;
export const MAX_PROOF_LONG_EDGE = 2200;
export const MAX_PROOF_PIXELS = MAX_PROOF_LONG_EDGE * MAX_PROOF_LONG_EDGE;
export const ALLOWED_PROOF_MIME_TYPES = ALLOWED_MIME_TYPES;
export type AllowedProofMimeType = (typeof ALLOWED_PROOF_MIME_TYPES)[number];
