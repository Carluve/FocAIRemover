# FocAIRemover

**Proyecto de investigación / experimental. No es un producto comercial ni un servicio garantizado.**

Investigación sobre marcas de procedencia de IA (Unicode invisible, C2PA/EXIF/XMP) con UI arrastrar-y-soltar en Cloudflare. **No** hay certificado de resultado. **Los datos pueden guardarse** (ver más abajo). El autor **no se hace responsable de nada**: [docs/DISCLAIMER.md](docs/DISCLAIMER.md).

This is a **research / experimental** project, **not** a commercial product or a guaranteed service. **Data may be stored.** The author **accepts no responsibility whatsoever.** Full disclaimer (Spanish, binding): [docs/DISCLAIMER.md](docs/DISCLAIMER.md).

**Estado: MVP R2-backed (implementado).** Cuenta Cloudflare **enterprise** `39f8ea10b94ad38470fc3c20c260efdc`. Bucket R2 `focairemover-files`. Deploy: [docs/DEPLOY.md](docs/DEPLOY.md). Arquitectura: [docs/PLAN.md](docs/PLAN.md).

**Status: R2-backed MVP.** Enterprise Cloudflare account only (not personal). Every uploaded file is stored in R2.

## Honesty constraints / Restricciones de honestidad

- **Layer A** (invisible Unicode) and **file metadata stripping** are **verifiable**.
- **Capa A** (Unicode invisible) y el **strip de metadatos** son **verificables**.
- **Statistical text watermarks** (Claude / Anthropic token-sampling, Kirchenbauer, SynthID-Text) are **ONLY weakened** by heavy rewrite (**Layer B**) — **best-effort**, **NOT certifiable** until Anthropic ships a public detector.
- Las **marcas estadísticas de texto** (Claude / Anthropic, Kirchenbauer, SynthID-Text) **solo se debilitan** con reescritura pesada (**Capa B**): **mejor esfuerzo**, **no certificable**, hasta que Anthropic publique un detector público.
- **Never** claim **“Anthropic watermark guaranteed removed”**.
- **Nunca** afirmar **«marca de agua de Anthropic garantizada como eliminada»**.
- Use on content you **own or are authorized to process**. Not academic fraud, not “human-written” theater. See [docs/ETHICS.md](docs/ETHICS.md), [docs/TOS.md](docs/TOS.md), [docs/DISCLAIMER.md](docs/DISCLAIMER.md).
- Solo contenido que **posees o estás autorizado a procesar**. No fraude académico. Ver [docs/ETHICS.md](docs/ETHICS.md), [docs/TOS.md](docs/TOS.md), [docs/DISCLAIMER.md](docs/DISCLAIMER.md).

Design is based on the highest-starred upstream **[guillaumemeyer/watermarks-remover](https://github.com/guillaumemeyer/watermarks-remover)** (~20k★, MIT, v0.7.0). UI inspiration: **[ivanusto/unmark-web](https://github.com/ivanusto/unmark-web)** (browser-first, **not affiliated**). This repo does **not** vendor the upstream Python tree.

El diseño se basa en el upstream con más estrellas. Inspiración de UI: unmark-web (**no afiliado**). Este repo **no** incluye el árbol Python de upstream.

## Datos: pueden guardarse / Data may be stored

**No asumas procesamiento local ni borrado al instante.** El camino principal sube **todos** los ficheros a R2.

| Fase | ¿El fichero sale de tu máquina? | Qué puede persistirse |
| --- | --- | --- |
| **MVP actual (R2 + Worker)** | **Sí** — `POST /api/upload` | Original, cleaned, `report.json`, metadatos D1, logs, IP. Bucket `focairemover-files`. **Sin promesa de TTL ni de borrado** |
| **Containers / CLEANER_URL** | Sí | Igual + lo que vea el proceso cleaner (tmp efímero no es garantía) |
| **Capa B (opcional, más adelante)** | Sí | Texto enviado a un modelo de terceros, más copias R2 |

Detalle: [docs/PLAN.md](docs/PLAN.md#datos-por-fase--data-by-phase) · descargo: [docs/DISCLAIMER.md](docs/DISCLAIMER.md) · deploy: [docs/DEPLOY.md](docs/DEPLOY.md).

## Descargo / Disclaimer

El autor y el proyecto **no se hacen responsables de nada**: ni del limpieado, ni de si un watermark sigue detectable, ni de tu uso, ni de daños, pérdidas, sanciones académicas o legales, ni de fallos del servicio. Software **«tal cual» / AS IS**, sin garantías. Texto completo: [docs/DISCLAIMER.md](docs/DISCLAIMER.md).

The author and the project **accept no responsibility whatsoever** for cleaning results, leftover-detectable watermarks, your use, damages, losses, academic or legal sanctions, or outages. **AS IS**, no warranties. Binding text: [docs/DISCLAIMER.md](docs/DISCLAIMER.md).

## How it will work / Cómo funcionará

| Phase | What | Host |
| --- | --- | --- |
| **MVP (now)** | Drag-drop → R2 original → job → watermarks-remover `/clean` → R2 cleaned → download | Workers + R2 `focairemover-files` + D1 `focairemover-jobs` on **enterprise** |
| **Containers** | Same `/clean` inside Cloudflare Containers (port 8765) | Uncomment wrangler containers; see DEPLOY.md |
| **Later** | Layer B rewrite (non-Claude); larger files | Optional Workers AI / OpenAI-compatible |
| **Out of scope** | Pixel SynthID / CtrlRegen (GPU); official Anthropic detector; guaranteed undetectability | — |

## Repository layout / Estructura

```
apps/web/              drag-drop UI → /api/upload → poll → download
apps/worker/           R2 + D1 job API
containers/cleaner/    Dockerfile FROM ghcr.io/guillaumemeyer/watermarks-remover
migrations/            D1 schema
docs/DEPLOY.md         enterprise account + R2/D1
docs/PLAN.md           architecture (ES+EN)
docs/DISCLAIMER.md     research + data + liability (binding)
wrangler.jsonc         account_id enterprise, FOCAI_FILES, JOBS, rate limit
```

## How to run / Cómo ejecutar

Cuenta enterprise only. See [docs/DEPLOY.md](docs/DEPLOY.md).

```bash
cp .dev.vars.example .dev.vars
npm install
npx wrangler d1 migrations apply focairemover-jobs --local
docker compose up --build -d    # optional cleaner
npx wrangler dev                # http://127.0.0.1:8787
npm test
```

Production (enterprise only): `npm run deploy`. That script sets `CLOUDFLARE_ACCOUNT_ID=39f8ea10b94ad38470fc3c20c260efdc` and refuses the personal account. Secrets: `npx wrangler secret put API_KEY`. Full steps: [docs/DEPLOY.md](docs/DEPLOY.md).

## Attribution / Atribución

MIT. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

Cleaning design, HTTP contract (`/health`, `/inspect`, `/clean`), and the GHCR image are **watermarks-remover**, © Guillaume Meyer and contributors, MIT. Preserve that notice in any port of their parsers.

El diseño de limpieza, el contrato HTTP y la imagen GHCR son **watermarks-remover**. Conservar esa atribución en cualquier port de sus parsers.

unmark-web is an independent MIT client; FocAIRemover is not a fork and is not an official watermarks-remover component.

unmark-web es un cliente MIT independiente; FocAIRemover no es un fork ni un componente oficial de watermarks-remover.
