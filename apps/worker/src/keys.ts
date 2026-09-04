/**
 * Shared constants. Keep in sync with wrangler.jsonc vars defaults.
 */

/**
 * The cleaner contract is base64-in-JSON, so a request of N bytes costs roughly
 * 3.7N of isolate memory (raw bytes + base64 string + the JSON envelope holding
 * it) against the Worker's 128 MB limit. 8 MiB keeps the peak near 30 MB;
 * 32 MiB peaked around 118 MB and dropped uploads under load.
 */
export const DEFAULT_MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
/** Fits the waitUntil fallback window; the queue consumer has far more room. */
export const DEFAULT_CLEANER_TIMEOUT_MS = 20_000;
/** Reclaim jobs stuck in `processing` if the consumer or waitUntil was cut off. */
export const STALE_PROCESSING_MS = 45_000;
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
