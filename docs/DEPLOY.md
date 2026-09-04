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

## 4c. Turnstile (required before a public deploy)

In public mode the per-IP rate limiter is the only brake, and it only slows a
single attacker down. Turnstile is what makes anonymous uploads defensible. The
Worker code is already wired; verification is a **no-op until the secret exists**,
so local dev and `npm test` are unaffected.

Create the widget from a **canonical Wrangler outside this project** (never
`npx`, never a project-local binary, for a credential-bearing command). It needs
Wrangler **4.109+** for the `turnstile` subcommand:

```bash
brew upgrade wrangler          # /opt/homebrew/bin/wrangler was 4.71, too old
wrangler --version             # must be >= 4.109
export CLOUDFLARE_ACCOUNT_ID=39f8ea10b94ad38470fc3c20c260efdc
wrangler turnstile widget create "FocAIRemover" \
  --domain focairemover.carluve.workers.dev \
  --domain localhost --domain 127.0.0.1 \
  --mode managed --json
```

Then, **without printing the secret**:

```bash
# 1. Public sitekey -> wrangler.jsonc vars.TURNSTILE_SITEKEY
# 2. Secret -> Worker secret, read from stdin, never an argument:
wrangler turnstile widget get <SITEKEY> --json \
  | jq -er .secret \
  | npx wrangler secret put TURNSTILE_SECRET
```

`TURNSTILE_HOSTNAMES` must list only production hostnames. Never put `localhost`
there: the widget accepts local domains so you can test, and a production
backend that also trusted `localhost` would accept a token minted on any dev
machine. With a secret set and `TURNSTILE_HOSTNAMES` empty the Worker returns
503 rather than verifying weakly.

Check it landed: `GET /api/health` reports `turnstile: "on"` and the sitekey.

## 4a. Cleaner options and the plain-text limitation

`CLEANER_OPTIONS` (a JSON string in `wrangler.jsonc`) is forwarded as `options`
to upstream `/clean`. Empty means **Layer A only**, which is what this project
claims to do, and is correct for `.md`, `.html`, images and PDFs.

Plain `.txt` is different. Upstream routes it to the `text` kind and makes a
**Layer B rewrite mandatory**, rejecting the request with
`Layer B strategy needs an LLM rewrite backend (WATERMARKS_REWRITE_BACKEND)`.
The Worker turns that into a `layer_b_required` job error that says so.

To make `.txt` clean you need **both**:

1. a rewrite backend on the cleaner itself — `WATERMARKS_REWRITE_BACKEND`
   (`openai-compatible` or `ollama`) plus `WATERMARKS_REWRITE_MODEL` /
   `_BASE_URL` / `_API_KEY`; or `transformers` installed for a local `mlm` step;
2. `CLEANER_OPTIONS` here, e.g. `{"strategy":"paraphrase@0.8"}`.

**This sends the user's text to a language model.** That is a different data
posture from Layer A, and [DISCLAIMER.md](DISCLAIMER.md) plus the data table in
[../README.md](../README.md) must stay accurate if you enable it. Layer B
weakens statistical watermarks at best — never claim removal.

## 4b. Queues (durable job processing) — done

Both queues exist on the enterprise account and the `queues` block in
`wrangler.jsonc` is **enabled**, so no action is needed:

| Queue | Role |
| --- | --- |
| `focairemover-clean` | producer + consumer, `max_batch_size: 1`, `max_retries: 3` |
| `focairemover-clean-dlq` | dead letter after 3 failed attempts |

Unbound, the Worker falls back to `ctx.waitUntil()`, whose budget dies with the
isolate and can strand a job in `processing`. `GET /api/health` reports `queue`
as `queue` or `waitUntil`, so you can tell which path a deployment is on.

To recreate them from scratch:

```bash
export CLOUDFLARE_ACCOUNT_ID=39f8ea10b94ad38470fc3c20c260efdc
npx wrangler queues create focairemover-clean-dlq
npx wrangler queues create focairemover-clean
```

`tests/queue-real.test.ts` exercises producer → Queues → consumer against a real
local queue, so the wiring is checked without deploying.

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
