# `containers/cleaner`

Dockerfile stub that **extends** `ghcr.io/guillaumemeyer/watermarks-remover:latest`.
This repo does **not** copy the upstream Python tree.

## Puerto / Port

| | |
| --- | --- |
| Listen | `0.0.0.0:8765` (upstream `CMD` already uses `--host 0.0.0.0`) |
| Worker | `defaultPort = 8765` on the `Container` subclass |
| Health | `GET /health` → `{"ok": true, "version": "..."}` |

## Por qué un Dockerfile y no `image: ghcr.io/...` / Why a wrapping Dockerfile

Cloudflare Containers accept pre-built images from the Cloudflare registry, Docker Hub, Amazon ECR, and Google Artifact Registry. **GHCR is not on that list.** Wrangler builds this file and pushes the result to Cloudflare’s registry. That is the supported way to host the upstream image.

## Local (sin Cloudflare) / Local (no Cloudflare)

```bash
docker build -t focairemover-cleaner -f containers/cleaner/Dockerfile containers/cleaner
docker run --rm -p 127.0.0.1:8765:8765 --read-only --tmpfs /tmp focairemover-cleaner
curl -s http://127.0.0.1:8765/health
```

El API upstream **no envía CORS** (a propósito). El navegador no debe llamarlo en crudo; el Worker es el proxy.

The upstream API **sends no CORS** (by design). The browser must not call it raw; the Worker is the proxy.

## Capa B en `/clean` de texto / Layer B on text `/clean`

Desde upstream v0.7.0, `POST /clean` sobre **texto plano** (`.txt`) aplica Capa B y responde **400** si el backend de reescritura no está configurado. PDF/DOCX/HTML/MD se limpian como **contenedores** (metadatos + Capa A) y **no** ejecutan Capa B.

From upstream v0.7.0, `POST /clean` on **plain text** (`.txt`) runs Layer B and returns **400** if the rewrite backend is missing. PDF/DOCX/HTML/MD are cleaned as **containers** (metadata + Layer A) and **do not** run Layer B.

En v1: enviar al contenedor PDF/DOCX/etc.; el texto se queda en el navegador (Capa A). Capa B = v1.5.

In v1: send PDF/DOCX/etc. to the container; keep text in the browser (Layer A). Layer B = v1.5.

Detalle: [docs/PLAN.md](../../docs/PLAN.md).
