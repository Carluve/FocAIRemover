-- Job metadata. Object bytes always live in R2 (FOCAI_FILES / focairemover-files).
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'done', 'error')),
  original_name TEXT NOT NULL,
  content_type TEXT,
  extension TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  cleaned_size_bytes INTEGER,
  error TEXT,
  report_summary TEXT,
  idempotency_key TEXT UNIQUE,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status);
CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs (created_at);
