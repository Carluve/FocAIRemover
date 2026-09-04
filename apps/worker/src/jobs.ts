import { STALE_PROCESSING_MS, type JobRow, type JobStatus } from "./keys";

export async function insertJob(
  db: D1Database,
  row: {
    id: string;
    original_name: string;
    content_type: string | null;
    extension: string;
    size_bytes: number;
    idempotency_key: string | null;
  },
): Promise<void> {
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO jobs (
        id, status, original_name, content_type, extension, size_bytes,
        idempotency_key, attempts, created_at, updated_at
      ) VALUES (?, 'queued', ?, ?, ?, ?, ?, 0, ?, ?)`,
    )
    .bind(
      row.id,
      row.original_name,
      row.content_type,
      row.extension,
      row.size_bytes,
      row.idempotency_key,
      now,
      now,
    )
    .run();
}

export async function getJob(db: D1Database, id: string): Promise<JobRow | null> {
  return db.prepare("SELECT * FROM jobs WHERE id = ?").bind(id).first<JobRow>();
}

export async function getJobByIdempotency(db: D1Database, key: string): Promise<JobRow | null> {
  return db.prepare("SELECT * FROM jobs WHERE idempotency_key = ?").bind(key).first<JobRow>();
}

export async function claimJob(db: D1Database, id: string): Promise<boolean> {
  const now = Date.now();
  const staleBefore = now - STALE_PROCESSING_MS;
  const result = await db
    .prepare(
      `UPDATE jobs
       SET status = 'processing', updated_at = ?, attempts = attempts + 1
       WHERE id = ?
         AND (
           status IN ('queued', 'error')
           OR (status = 'processing' AND updated_at < ?)
         )`,
    )
    .bind(now, id, staleBefore)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function finishJob(
  db: D1Database,
  id: string,
  patch: {
    status: JobStatus;
    error?: string | null;
    cleaned_size_bytes?: number | null;
    report_summary?: string | null;
  },
): Promise<void> {
  const now = Date.now();
  await db
    .prepare(
      `UPDATE jobs
       SET status = ?, error = ?, cleaned_size_bytes = ?, report_summary = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      patch.status,
      patch.error ?? null,
      patch.cleaned_size_bytes ?? null,
      patch.report_summary ?? null,
      now,
      id,
    )
    .run();
}

export function publicJob(row: JobRow) {
  return {
    ok: true,
    id: row.id,
    status: row.status,
    originalName: row.original_name,
    contentType: row.content_type,
    extension: row.extension,
    sizeBytes: row.size_bytes,
    cleanedSizeBytes: row.cleaned_size_bytes,
    error: row.error,
    reportSummary: row.report_summary ? safeParse(row.report_summary) : null,
    attempts: row.attempts,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    download:
      row.status === "done" ? `/api/jobs/${row.id}/download` : null,
  };
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
