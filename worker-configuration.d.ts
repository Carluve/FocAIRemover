// Generated stub matching wrangler.jsonc. Re-run `npx wrangler types` after binding changes.
interface Env {
  ASSETS: Fetcher;
  FOCAI_FILES: R2Bucket;
  JOBS: D1Database;
  RATE_LIMITER: RateLimit;
  ALLOWED_ORIGIN: string;
  ENVIRONMENT: string;
  MAX_UPLOAD_BYTES: string;
  CLEANER_TIMEOUT_MS: string;
  API_KEY?: string;
  CLEANER_URL?: string;
  WATERMARKS_SERVER_API_KEY?: string;
  CLEANER?: DurableObjectNamespace;
}

interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}
