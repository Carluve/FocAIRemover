# `apps/web` — UI estática

Single-page vanilla (HTML/CSS/JS). Spanish-first, dark Cloudflare-adjacent theme.

Flujo: dropzone → `POST /api/upload` → poll `GET /api/jobs/:id` → descarga / informe.
Reintento: `POST /api/jobs`. Salud: `GET /api/health` (`layerA` vs `cleaner`).

Los ficheros **salen del navegador** y **pueden quedarse en R2**. El aviso legal es colapsable pero obligatorio. Nunca afirmar que se eliminó una marca de Anthropic.
