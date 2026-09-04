# Deploy — cuenta Cloudflare enterprise

**Account:** carluve @enterprise  
**Account ID:** `39f8ea10b94ad38470fc3c20c260efdc`  
**R2 bucket:** `focairemover-files`

**No usar** la cuenta personal `052a5feff6731a169b7012425b020cc5`.

`wrangler.jsonc` fija `account_id` a enterprise. `npm run deploy` exporta el mismo ID. Si ves el error **10042** (R2 not enabled), estás en la cuenta **personal** — para y cambia a enterprise. En enterprise R2 ya está habilitado y el bucket existe.

## Recursos ya creados (enterprise)

Verificado 2026-09-04 contra la API de Cloudflare (cuenta `39f8ea10b94ad38470fc3c20c260efdc`):

| Recurso | Nombre | ID / notas |
| --- | --- | --- |
| R2 | `focairemover-files` | binding `FOCAI_FILES` — originales, cleaned, reportes. Creado 2026-09-04. |
| D1 | `focairemover-jobs` | `d7d7154b-3a79-4bee-ae2f-c0f74e6b69aa` — binding `JOBS`. Migración `0001_jobs.sql` aplicada en remoto. |
| Rate limit | namespace `904201` | 30 req / 60 s (localidad Cloudflare) |

### Si el bucket no existiera (enterprise dashboard)

1. Dashboard → **R2 Object Storage** (cuenta **enterprise**, no personal).
2. Enable R2 on this account if the product is off.
3. Create bucket `focairemover-files` (or `npx wrangler r2 bucket create focairemover-files` with `CLOUDFLARE_ACCOUNT_ID=39f8ea10b94ad38470fc3c20c260efdc`).

Hoy **no hace falta**: el bucket ya está.

```bash
# equivalent API (enterprise only):
# GET/POST /accounts/39f8ea10b94ad38470fc3c20c260efdc/r2/buckets
```

## Local

```bash
cp .dev.vars.example .dev.vars
npm install
npx wrangler d1 migrations apply focairemover-jobs --local
docker compose up --build -d          # cleaner on 127.0.0.1:8765
npx wrangler dev                      # http://127.0.0.1:8787
npm test
node scripts/smoke.mjs
```

Sin Docker, `/api/upload` **sí** guarda el original en R2 y crea el job; el job pasa a `error` (`cleaner_unavailable` / unreachable) hasta que `CLEANER_URL` o Containers estén vivos. Eso es intencional: no se finge un clean.

## Producción (enterprise) — pasos exactos

Autenticado contra **carluve @enterprise**. Comprueba `npx wrangler whoami` (account id `39f8ea10b94ad38470fc3c20c260efdc`).

```bash
export CLOUDFLARE_ACCOUNT_ID=39f8ea10b94ad38470fc3c20c260efdc
# Refuse personal:
#   052a5feff6731a169b7012425b020cc5  ← no

npx wrangler d1 migrations apply focairemover-jobs --remote
npx wrangler secret put API_KEY                     # opcional (Bearer en /api)
npx wrangler secret put WATERMARKS_SERVER_API_KEY   # opcional, hacia el cleaner
npx wrangler secret put CLEANER_URL                 # solo si el cleaner no es Container
npm run deploy                                      # wrangler deploy, account_id enterprise
```

O en un comando: `npm run deploy` (el script fija `CLOUDFLARE_ACCOUNT_ID`).

Tras el deploy: `https://focairemover.<subdomain>.workers.dev` (o el route que se añada). Health: `GET /api/health` (incluye `account` y `r2`).

### Containers (cleaner)

Hasta que Docker esté en la máquina de deploy, deja el bloque `containers` **comentado** en `wrangler.jsonc`. El Worker sigue siendo desplegable: uploads van a R2; los jobs fallan honestamente si no hay cleaner.

Para activar el cleaner en Cloudflare:

1. Instalar `@cloudflare/containers`.
2. Descomentar `containers` / `durable_objects` / `migrations` en `wrangler.jsonc`.
3. Exportar `CleanerContainer` desde `apps/worker/src/index.ts` (ver `container.ts`).
4. Docker en la máquina de deploy (Wrangler construye `containers/cleaner/Dockerfile` y lo sube al registry de Cloudflare **de esta cuenta enterprise**).
5. `npm run deploy`

Hasta entonces, un `CLEANER_URL` alcanzable desde el Worker (no loopback de tu laptop en producción).

## API

| Método | Ruta | Qué hace |
| --- | --- | --- |
| GET | `/api/health` | Worker + ping opcional al cleaner |
| POST | `/api/upload` | multipart `file` → R2 `uploads/{jobId}/original` + fila D1 `queued` + `waitUntil` clean |
| POST | `/api/jobs` o `/api/clean` | `{ "jobId" }` reintenta/arranca |
| GET | `/api/jobs/:id` | `queued \| processing \| done \| error` |
| GET | `/api/jobs/:id/download` | stream R2 `uploads/{jobId}/cleaned` |

Claves R2 opacas. El nombre de usuario solo vive en D1 / metadatos. Header `Idempotency-Key` en upload. `Authorization: Bearer` si `API_KEY` está definido. CORS: mismo origen o `ALLOWED_ORIGIN`, **nunca `*`**.

Tope de subida: 32 MiB (`MAX_UPLOAD_BYTES`).

## Datos

Los objetos en `focairemover-files` **pueden conservarse** (investigación / operación). Ver [DISCLAIMER.md](DISCLAIMER.md).
