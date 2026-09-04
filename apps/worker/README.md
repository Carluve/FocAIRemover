# `apps/worker` — R2-backed API

Worker on **carluve @enterprise** (`39f8ea10b94ad38470fc3c20c260efdc`).

- R2 `focairemover-files` → `env.FOCAI_FILES`
- D1 `focairemover-jobs` → `env.JOBS`
- Rate limit binding `RATE_LIMITER` (namespace `904201`)

Every upload is stored at `uploads/{jobId}/original` before `/clean`. Cleaned bytes go to `uploads/{jobId}/cleaned`. Download streams from R2.

Cleaner seam: `CLEANER_URL` (docker compose) or Cloudflare Containers (`CleanerContainer`, port 8765). See [docs/DEPLOY.md](../../docs/DEPLOY.md).

Do not add `Access-Control-Allow-Origin: *`.
