# Arquitectura — FocAIRemover

Implementers’ map of the **current** R2-backed Worker. Broader research notes (layers, upstream tables, out-of-scope GPU) stay in [PLAN.md](PLAN.md). Deploy: [DEPLOY.md](DEPLOY.md).

## Runtime path

```
Browser (apps/web)
  POST /api/upload          multipart field `file`
       → validate allowlist + 32 MiB
       → R2 uploads/{jobId}/original + meta.json
       → D1 jobs row (queued)
       → 202 + ctx.waitUntil(processJob)
  GET  /api/jobs/:id        poll
  GET  /api/jobs/:id/download
  GET  /api/jobs/:id/report
  POST /api/jobs            retry (re-claim queued|error|stale processing)
  GET  /api/health          layerA + remote cleaner
```

`processJob`:

1. **`.txt` `.md` `.html` `.htm` `.svg`** → Worker [Layer A](../apps/worker/src/layerA.ts) (UTF-8). Does **not** call `/clean` (upstream v0.7.0 would demand Layer B on plain `.txt` and 400).
2. **Everything else** → remote cleaner (`CLEANER` Durable Object **or** `CLEANER_URL`) `POST /clean` JSON `{ file: base64, name, options: {} }`.
3. Write `uploads/{jobId}/cleaned` + `report.json`, mark D1 `done` | `error`.

Retries: 3 attempts on HTTP ≥500 / timeout / unreachable, 250 ms × 2^(n-1). `waitUntil` budget is 30 s — keep `CLEANER_TIMEOUT_MS` ≤ 20 s.

## Health

| Field | Meaning |
| --- | --- |
| `layerA` | Always `up` if the Worker is serving |
| `cleaner` / `remoteCleaner` | `up` \| `down` \| `unconfigured` \| `invalid_loopback` |
| `canClean.text` | Layer A |
| `canClean.containers` | remote `/health` ok |
| `enableStep` | one-line how to turn the remote cleaner on |

Production **rejects** `CLEANER_URL=http://127.0.0.1` (`ENVIRONMENT=production`). Local `wrangler dev` + compose is fine.

## Bindings (enterprise)

| Binding | Resource |
| --- | --- |
| `FOCAI_FILES` | R2 `focairemover-files` |
| `JOBS` | D1 `focairemover-jobs` (`d7d7154b-3a79-4bee-ae2f-c0f74e6b69aa`) |
| `RATE_LIMITER` | 30 / 60 s, namespace `904201` |
| `ASSETS` | `apps/web`, `run_worker_first` |
| `CLEANER` | optional Container DO (commented in `wrangler.jsonc`) |

Optional secrets: `API_KEY` (Bearer on `/api` except health), `CLEANER_URL`, `WATERMARKS_SERVER_API_KEY`.

CORS: same-origin or exact `ALLOWED_ORIGIN`. **Never `*`.**

## Enabling the remote cleaner (one step)

**A — URL (no Docker on the Worker host)**

```bash
npx wrangler secret put CLEANER_URL
# value: https://<reachable-watermarks-remover>
```

Host that process yourself (`docker compose` + tunnel, Fly, a VM). The Worker only needs HTTPS + `/health` + `/clean`.

**B — Cloudflare Containers (Docker on the deploy machine)**

1. `npm i @cloudflare/containers`
2. Implement `CleanerContainer` as documented in `apps/worker/src/container.ts`
3. Uncomment `containers` / `durable_objects` / `migrations` in `wrangler.jsonc`
4. `export { CleanerContainer } from "./container"` in `apps/worker/src/index.ts`
5. `npm run deploy`

Image: `containers/cleaner/Dockerfile` `FROM ghcr.io/guillaumemeyer/watermarks-remover` (GHCR is not a pre-built Containers source; Wrangler builds and pushes to the Cloudflare registry). `defaultPort = 8765`.

## Honesty in reports

`report_summary.note` always includes: Layer A / metadata are verifiable; statistical marks are **not** certified removed; never “Anthropic watermark guaranteed removed”. Layer B is not configured.

## Repo map

```
apps/web/                 UI
apps/worker/src/          API, Layer A, cleaner client, jobs
containers/cleaner/       Dockerfile wrapper
migrations/               D1
docs/                     DISCLAIMER ETHICS TOS DEPLOY PLAN ARCHITECTURE
```
