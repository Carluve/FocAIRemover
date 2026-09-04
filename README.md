# FocAIRemover

Cloudflare drag-and-drop app that returns files cleaned of **verifiable** AI provenance marks: invisible Unicode (**Layer A**) and C2PA / EXIF / XMP metadata.

Aplicación web en Cloudflare, arrastrar-y-soltar, que devuelve ficheros sin marcas de procedencia de IA **verificables**: Unicode invisible (**Capa A**) y metadatos C2PA / EXIF / XMP.

**Status: planning / scaffold.** Architecture is in [docs/PLAN.md](docs/PLAN.md). Browser cleaning is not wired yet. Server-side PDF/DOCX lands in **v1** (Workers + Containers).

**Estado: planificación / andamiaje.** La arquitectura está en [docs/PLAN.md](docs/PLAN.md). El motor en el navegador aún no está conectado. PDF/DOCX de servidor llega en **v1**.

## Honesty constraints / Restricciones de honestidad

- **Layer A** (invisible Unicode) and **file metadata stripping** are **verifiable**.
- **Capa A** (Unicode invisible) y el **strip de metadatos** son **verificables**.
- **Statistical text watermarks** (Claude / Anthropic token-sampling, Kirchenbauer, SynthID-Text) are **ONLY weakened** by heavy rewrite (**Layer B**) — **best-effort**, **NOT certifiable** until Anthropic ships a public detector.
- Las **marcas estadísticas de texto** (Claude / Anthropic, Kirchenbauer, SynthID-Text) **solo se debilitan** con reescritura pesada (**Capa B**): **mejor esfuerzo**, **no certificable**, hasta que Anthropic publique un detector público.
- **Never** claim **“Anthropic watermark guaranteed removed”**.
- **Nunca** afirmar **«marca de agua de Anthropic garantizada como eliminada»**.
- Use on content you **own or are authorized to process**. Not academic fraud, not “human-written” theater. See [docs/ETHICS.md](docs/ETHICS.md) and [docs/TOS.md](docs/TOS.md).
- Solo contenido que **posees o estás autorizado a procesar**. No fraude académico. Ver [docs/ETHICS.md](docs/ETHICS.md) y [docs/TOS.md](docs/TOS.md).

Design is based on the highest-starred upstream **[guillaumemeyer/watermarks-remover](https://github.com/guillaumemeyer/watermarks-remover)** (~20k★, MIT, v0.7.0). UI inspiration: **[ivanusto/unmark-web](https://github.com/ivanusto/unmark-web)** (browser-first, **not affiliated**). This repo does **not** vendor the upstream Python tree.

El diseño se basa en el upstream con más estrellas. Inspiración de UI: unmark-web (**no afiliado**). Este repo **no** incluye el árbol Python de upstream.

## How it will work / Cómo funcionará

| Phase | What | Host |
| --- | --- | --- |
| **MVP** | Drag-drop; Layer A + image/AV metadata in the **browser**; no upload | Workers Static Assets |
| **v1** | PDF / DOCX / full `/clean` | Worker proxy → Cloudflare Container (`ghcr.io/guillaumemeyer/watermarks-remover` on port **8765**) |
| **v1.5** | Large files; Layer B rewrite | R2 + non-Claude OpenAI-compatible API / Workers AI |
| **Out of scope** | Pixel SynthID / CtrlRegen (GPU); official Anthropic detector | — |

## Repository layout / Estructura

```
apps/web/              static UI (drag-drop stub)
apps/worker/           Worker proxy stub (501 on /api until v1)
containers/cleaner/    Dockerfile FROM ghcr.io/guillaumemeyer/watermarks-remover:latest
docs/PLAN.md           architecture (ES+EN)
docs/ETHICS.md         intended use
docs/TOS.md            draft terms
NOTICE                 MIT attribution for derived work
wrangler.jsonc         Workers + commented Containers / R2
```

## How to run later / Cómo ejecutar después

Hoy / today (scaffold only — placeholder page, `/api` returns 501):

```bash
npm install
npx wrangler dev
# http://127.0.0.1:8787
```

MVP (next implementation): same command, once JS engines live under `apps/web`. No Docker.

v1 — local upstream API (optional, not vendored):

```bash
docker build -t focairemover-cleaner -f containers/cleaner/Dockerfile containers/cleaner
docker run --rm -p 127.0.0.1:8765:8765 --read-only --tmpfs /tmp focairemover-cleaner
curl -s http://127.0.0.1:8765/health
```

v1 — Cloudflare: uncomment the `containers` block in `wrangler.jsonc`, implement `CleanerContainer` (`defaultPort = 8765`), then `npm run deploy`. Paid Workers plan required for Containers.

Secrets: copy `.dev.vars.example` → `.dev.vars`. Production: `npx wrangler secret put CLEANER_API_KEY`.

## Attribution / Atribución

MIT. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

Cleaning design, HTTP contract (`/health`, `/inspect`, `/clean`), and the GHCR image are **watermarks-remover**, © Guillaume Meyer and contributors, MIT. Preserve that notice in any port of their parsers.

El diseño de limpieza, el contrato HTTP y la imagen GHCR son **watermarks-remover**. Conservar esa atribución en cualquier port de sus parsers.

unmark-web is an independent MIT client; FocAIRemover is not a fork and is not an official watermarks-remover component.

unmark-web es un cliente MIT independiente; FocAIRemover no es un fork ni un componente oficial de watermarks-remover.
