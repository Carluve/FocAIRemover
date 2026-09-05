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

## 4. Secrets (optional)

```bash
npx wrangler secret put API_KEY                     # Bearer on /api except /health
npx wrangler secret put WATERMARKS_SERVER_API_KEY   # Worker → cleaner
npx wrangler secret put CLEANER_URL                 # only if cleaner is not a Container
```

No secrets are required for a first deploy. **Worker Layer A** cleans `.txt` / `.md` / `.html` / `.svg` without a remote cleaner. PDF / Office / raster / AV jobs end in `error` (`cleaner_unconfigured`) until you set `CLEANER_URL` or enable Containers. That is intentional.

`CLEANER_URL=http://127.0.0.1:8765` is for **local** `wrangler dev` only. Production rejects loopback — the Worker cannot reach your laptop. Use a public HTTPS origin or a Container.

## 5. Deploy the Worker

```bash
export CLOUDFLARE_ACCOUNT_ID=39f8ea10b94ad38470fc3c20c260efdc
npm install
npm run deploy
```

`npm run deploy` refuses the personal account. Check `GET https://focairemover.carluve.workers.dev/api/health`:

- `account` = `39f8ea10b94ad38470fc3c20c260efdc`
- `r2` = `focairemover-files`
- `layerA` = `up`
- `cleaner` = `up` | `unconfigured` | `down` | `invalid_loopback` (remote only; text still works when `layerA` is up)

Same-origin UI is served from the Worker. CORS is never `*`.

If Wrangler is not logged in, deploy the same way as the last production push: Cloudflare API upload of the Wrangler bundle + static assets (see the `focairemover` Worker on the enterprise account; `last_deployed_from: api`).

Same-origin UI is served from the Worker. CORS is never `*`.

## 6. Remote cleaner — one enable step

**A. `CLEANER_URL` (no Docker on the Worker host)**

Run watermarks-remover somewhere the Worker can fetch (`docker compose` + tunnel, Fly, a VM):

```bash
npx wrangler secret put CLEANER_URL
```

Value: origin only, e.g. `https://cleaner.example.com` (paths `/health` and `/clean`).

**B. Cloudflare Containers** — leave the `containers` block in `wrangler.jsonc` **commented** until Docker is on the deploy machine. Then:

1. `npm i @cloudflare/containers`
2. Uncomment `containers` / `durable_objects` / `migrations` in `wrangler.jsonc`
3. Implement + `export { CleanerContainer }` as in `apps/worker/src/container.ts`
4. `npm run deploy` (Wrangler builds `containers/cleaner/Dockerfile` and pushes to this enterprise account)

Until A or B: text Layer A still works; container formats return `cleaner_unconfigured`.

## Local

```bash
cp .dev.vars.example .dev.vars
npm install
npx wrangler d1 migrations apply focairemover-jobs --local
docker compose up --build -d    # optional, 127.0.0.1:8765
npx wrangler dev
npm test
node scripts/smoke.mjs
```

Objects in `focairemover-files` **may be kept**. See [DISCLAIMER.md](DISCLAIMER.md).
