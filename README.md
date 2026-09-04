# FocAIRemover

**Proyecto de investigación / experimental. No es un producto comercial ni un servicio garantizado.**

Investigación sobre marcas de procedencia de IA (Unicode invisible, C2PA/EXIF/XMP) con UI arrastrar-y-soltar en Cloudflare. **No** hay certificado de resultado. **Los datos pueden guardarse** (ver más abajo). El autor **no se hace responsable de nada**: [docs/DISCLAIMER.md](docs/DISCLAIMER.md).

This is a **research / experimental** project, **not** a commercial product or a guaranteed service. **Data may be stored.** The author **accepts no responsibility whatsoever.** Full disclaimer (Spanish, binding): [docs/DISCLAIMER.md](docs/DISCLAIMER.md).

**Estado: planificación / andamiaje.** Arquitectura: [docs/PLAN.md](docs/PLAN.md). El motor de limpieza aún no está conectado. PDF/DOCX de servidor = **v1**.

**Status: planning / scaffold.** Browser cleaning is not wired yet. Server-side PDF/DOCX lands in **v1**.

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

**No asumas procesamiento 100 % local ni borrado al instante**, salvo los **bytes del fichero en el MVP del navegador** (no hay upload al cleaner; sí puede haber logs de CDN/Worker: IP, URL, User-Agent).

| Fase | ¿El fichero sale de tu máquina? | Qué puede persistirse |
| --- | --- | --- |
| **MVP (navegador)** | No (bytes del archivo se quedan en la pestaña) | Logs de petición al servir la página; analítica de Cloudflare/Workers si está activa |
| **v1 (Worker + contenedor)** | **Sí** — subes a `/api` | Uploads, salidas, informes, logs, IP y metadatos de uso, **copias para investigación**. Sin promesa de TTL ni de borrado |
| **v1.5 (R2 + Capa B)** | **Sí** | Objetos en R2, reescrituras enviadas a un modelo, logs. Igual: pueden guardarse para investigación / operación |

Detalle: [docs/PLAN.md](docs/PLAN.md#datos-por-fase--data-by-phase) · descargo: [docs/DISCLAIMER.md](docs/DISCLAIMER.md).

## Descargo / Disclaimer

El autor y el proyecto **no se hacen responsables de nada**: ni del limpieado, ni de si un watermark sigue detectable, ni de tu uso, ni de daños, pérdidas, sanciones académicas o legales, ni de fallos del servicio. Software **«tal cual» / AS IS**, sin garantías. Texto completo: [docs/DISCLAIMER.md](docs/DISCLAIMER.md).

The author and the project **accept no responsibility whatsoever** for cleaning results, leftover-detectable watermarks, your use, damages, losses, academic or legal sanctions, or outages. **AS IS**, no warranties. Binding text: [docs/DISCLAIMER.md](docs/DISCLAIMER.md).

## How it will work / Cómo funcionará

| Phase | What | Host |
| --- | --- | --- |
| **MVP** | Drag-drop; Layer A + image/AV metadata in the **browser**; file bytes not uploaded (page request logs may still exist) | Workers Static Assets |
| **v1** | PDF / DOCX / full `/clean` | Worker proxy → Cloudflare Container (`ghcr.io/guillaumemeyer/watermarks-remover` on port **8765**) |
| **v1.5** | Large files; Layer B rewrite | R2 + non-Claude OpenAI-compatible API / Workers AI |
| **Out of scope** | Pixel SynthID / CtrlRegen (GPU); official Anthropic detector | — |

## Repository layout / Estructura

```
apps/web/              static UI (drag-drop stub)
apps/worker/           Worker proxy stub (501 on /api until v1)
containers/cleaner/    Dockerfile FROM ghcr.io/guillaumemeyer/watermarks-remover:latest
docs/PLAN.md           architecture (ES+EN)
docs/DISCLAIMER.md     research + data + liability (binding)
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
