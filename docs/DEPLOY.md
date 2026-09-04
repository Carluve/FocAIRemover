# Deploy — FocAIRemover (enterprise only)

**Account:** carluve @enterprise · `39f8ea10b94ad38470fc3c20c260efdc`  
**R2 bucket:** `focairemover-files`  
**D1:** `focairemover-jobs` (`d7d7154b-3a79-4bee-ae2f-c0f74e6b69aa`)

Do **not** use personal `052a5feff6731a169b7012425b020cc5`.

If Cloudflare returns **error 10042** (R2 not enabled), you are on the **personal** account. Stop. Switch the dashboard / `wrangler whoami` to **enterprise**. R2 is already enabled there.

## 1. Enable R2 (only if needed)

Dashboard → account **carluve @enterprise** → **R2 Object Storage** → Enable R2.

Skip if you already see buckets. `focairemover-files` was created 2026-09-04.

## 2. Create the bucket (only if missing)

```bash
export CLOUDFLARE_ACCOUNT_ID=39f8ea10b94ad38470fc3c20c260efdc
npx wrangler whoami    # must show 39f8ea10b94ad38470fc3c20c260efdc
npx wrangler r2 bucket create focairemover-files
```

## 3. D1 schema (remote)

```bash
export CLOUDFLARE_ACCOUNT_ID=39f8ea10b94ad38470fc3c20c260efdc
npx wrangler d1 migrations apply focairemover-jobs --remote
```

Already applied (`0001_jobs.sql`). Safe to re-run; Wrangler skips applied migrations.

## 4. Access control — decide before you deploy

`/api/upload` and `/api/jobs` are gated by **one** of two modes. There is no third,
"whatever happens" mode: an unset `API_KEY` with `PUBLIC_UPLOADS` off returns
**503 `server_misconfigured`** rather than serving the API openly.

| Mode | Config | Who can upload |
| --- | --- | --- |
| **Public** (default) | `PUBLIC_UPLOADS: "true"` in `wrangler.jsonc`, no `API_KEY` | **Anyone on the internet.** Only the rate limiter (30 req/60s per IP) stands in the way. This is what the bundled drag-drop UI needs — a browser page cannot hold a secret. |
| **API clients only** | `PUBLIC_UPLOADS: "false"` + `wrangler secret put API_KEY` | Bearer-token holders. The bundled UI **stops working**; it never sends an `Authorization` header. |

Confirm which one you shipped: `GET /api/health` reports `auth` as `bearer`,
`public`, or `misconfigured`.

Public mode means strangers spend your enterprise R2 and cleaner capacity, and
every uploaded file is retained. If you want the public UI *and* a brake on
automated abuse, put [Turnstile](https://developers.cloudflare.com/turnstile/)
in front of `/api/upload` — that is the missing piece, not a longer API key.

```bash
npx wrangler secret put API_KEY                     # Bearer on /api except /health
npx wrangler secret put WATERMARKS_SERVER_API_KEY   # Worker → cleaner
npx wrangler secret put CLEANER_URL                 # only if cleaner is not a Container
```

Without `CLEANER_URL` / Containers, uploads still go to R2; jobs end in `error` (`cleaner_unreachable`). That is intentional.

## 4b. Queues (durable job processing) — strongly recommended

Unbound, the Worker cleans inside `ctx.waitUntil()`. That budget dies with the
isolate: a job can be stranded in `processing` with nothing to re-drive it
except the UI's retry button. Queues gives it durable retries and a
dead-letter queue.

```bash
export CLOUDFLARE_ACCOUNT_ID=39f8ea10b94ad38470fc3c20c260efdc
npx wrangler queues create focairemover-clean-dlq
npx wrangler queues create focairemover-clean
```

Then uncomment the `queues` block in `wrangler.jsonc` and redeploy. The Worker
code already handles both paths; `GET /api/health` reports `queue` as `queue`
or `waitUntil`. Create the queues **before** uncommenting, or `wrangler deploy`
will fail on the missing queue.

## 5. Deploy the Worker

```bash
export CLOUDFLARE_ACCOUNT_ID=39f8ea10b94ad38470fc3c20c260efdc
npm install
npm run deploy
```

`npm run deploy` refuses the personal account. Check `GET https://focairemover.<subdomain>.workers.dev/api/health` — `account` must be `39f8ea10b94ad38470fc3c20c260efdc` and `r2` must be `focairemover-files`.

Same-origin UI is served from the Worker. CORS is never `*`.

## 6. Containers (cleaner) — later

Leave the `containers` block in `wrangler.jsonc` **commented** until Docker is on the deploy machine.

Then:

1. `npm i @cloudflare/containers`
2. Uncomment `containers` / `durable_objects` / `migrations` in `wrangler.jsonc`
3. `export { CleanerContainer } from "./container"` in `apps/worker/src/index.ts`
4. `npm run deploy` (Wrangler builds `containers/cleaner/Dockerfile` and pushes to this enterprise account)

Until then: `CLEANER_URL` must be reachable from the Worker (not `127.0.0.1` of your laptop).

## Local

```bash
cp .dev.vars.example .dev.vars
npm install
npx wrangler d1 migrations apply focairemover-jobs --local
docker compose up --build -d    # optional, 127.0.0.1:8765
npx wrangler dev
npm test          # workerd + real R2/D1 bindings
npm run typecheck
node scripts/smoke.mjs
```

Full end-to-end over HTTP (see the Tests section in [../README.md](../README.md)):

```bash
npm run fake-cleaner &   # fixture only — strips invisible Unicode, nothing else
echo 'CLEANER_URL=http://127.0.0.1:8765' > .dev.vars
npx wrangler dev &
npm run e2e
```

## Limits

`MAX_UPLOAD_BYTES` is **8 MiB**. The cleaner contract is base64-in-JSON, so an
N-byte upload costs roughly 3.7N of isolate memory (raw bytes + base64 string +
the JSON envelope) against the Worker's 128 MB ceiling. The previous 32 MiB cap
peaked near 118 MB. Raising it again needs a streaming or multipart cleaner
contract, not just a bigger number.

Objects in `focairemover-files` **may be kept**. See [DISCLAIMER.md](DISCLAIMER.md).
