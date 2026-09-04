/**
 * Shared constants. Keep in sync with wrangler.jsonc vars defaults.
 */

export const DEFAULT_MAX_UPLOAD_BYTES = 32 * 1024 * 1024;
export const DEFAULT_CLEANER_TIMEOUT_MS = 55_000;
export const CLEANER_MAX_ATTEMPTS = 3;
export const JOB_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Opaque R2 keys — never use the user filename as the object key. */
export function r2OriginalKey(jobId: string): string {
  return `uploads/${jobId}/original`;
}

export function r2CleanedKey(jobId: string): string {
  return `uploads/${jobId}/cleaned`;
}

export function r2ReportKey(jobId: string): string {
  return `uploads/${jobId}/report.json`;
}

export function r2MetaKey(jobId: string): string {
  return `uploads/${jobId}/meta.json`;
}

export type JobStatus = "queued" | "processing" | "done" | "error";

export type JobRow = {
  id: string;
  status: JobStatus;
  original_name: string;
  content_type: string | null;
  extension: string;
  size_bytes: number;
  cleaned_size_bytes: number | null;
  error: string | null;
  report_summary: string | null;
  idempotency_key: string | null;
  attempts: number;
  created_at: number;
  updated_at: number;
};
