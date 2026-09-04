# `apps/web` — drag-and-drop (R2 MVP)

Static assets. The UI **uploads** to `POST /api/upload`, polls `GET /api/jobs/:id`, retries via `POST /api/jobs`, and downloads via `GET /api/jobs/:id/download`. A health line shows whether the cleaner is up.

Files **leave the browser** and **may be kept in R2**. Disclaimer stays visible. Never claim Anthropic watermarks are guaranteed removed.

Local: `npm install && npm run migrate:local && npm run dev`.
