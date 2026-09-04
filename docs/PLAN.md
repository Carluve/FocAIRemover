# Plan de arquitectura — FocAIRemover
# Architecture plan — FocAIRemover

**Naturaleza:** FocAIRemover es un **proyecto de investigación / experimental**. No es un producto comercial ni un servicio garantizado. Descargo vinculante: [DISCLAIMER.md](DISCLAIMER.md).

**Nature:** research / experimental — **not** a commercial product or a guaranteed service. Binding disclaimer: [DISCLAIMER.md](DISCLAIMER.md).

Estado / Status: **planificación + andamiaje**. El MVP de limpieza en el navegador aún no está implementado.
This is **planning + scaffold**. Browser cleaning is not implemented yet.

Documento pensado para que el **siguiente agente implemente el MVP sin reinvestigar el upstream**.
Written so the **next agent can implement the MVP without re-researching upstream**.

Fuentes comprobadas el **2026-09-04**:
Sources checked **2026-09-04**:

- Upstream README + `service/Dockerfile` + `service/scripts/server.py` + `skills/remove-ai-marks/SKILL.md` + `references/ethics.md`
- [unmark-web README](https://github.com/ivanusto/unmark-web)
- Cloudflare Containers, Workers Static Assets, Workers limits, image management

---

## Restricciones de honestidad / Honesty constraints

Estas frases deben aparecer en la UI, el README y cualquier marketing. No negociable.

These sentences must appear in the UI, README, and any marketing. Non-negotiable.

| ES | EN |
| --- | --- |
| La **Capa A** (Unicode invisible) y el **strip de metadatos** de archivo (C2PA/EXIF/XMP) son **verificables**: se puede re-inspeccionar y contar lo que salió. | **Layer A** (invisible Unicode) and **file metadata stripping** (C2PA/EXIF/XMP) are **verifiable**: re-inspect and count what left. |
| Las **marcas estadísticas de texto** (muestreo de tokens de Claude/Anthropic, Kirchenbauer/KGW, SynthID-Text) **solo se debilitan** con reescritura pesada (**Capa B**). Es **mejor esfuerzo**, **no certificable**, hasta que Anthropic publique un detector público. | **Statistical text watermarks** (Claude/Anthropic token-sampling, Kirchenbauer/KGW, SynthID-Text) are **ONLY weakened** by heavy rewrite (**Layer B**) — **best-effort**, **NOT certifiable** until Anthropic ships a public detector. |
| **Nunca** afirmar: «marca de agua de Anthropic garantizada como eliminada». | **Never** claim **“Anthropic watermark guaranteed removed”**. |
| Ética: contenido que el usuario **posee o está autorizado a procesar**. No fraude académico ni teatro de «escrito por un humano». | Ethics: content the user **owns / is authorized to process**; not academic fraud. |
| Es un **proyecto de investigación**, no un producto ni un servicio con SLA. | This is a **research project**, not a product or an SLA service. |
| Los **datos pueden guardarse** (uploads, logs, copias, metadatos de uso) salvo los bytes del fichero en el MVP del navegador. | **Data may be stored** (uploads, logs, copies, usage metadata) except file bytes in the browser MVP. |
| El autor **no se hace responsable de nada**. Software «tal cual» / AS IS. Ver [DISCLAIMER.md](DISCLAIMER.md). | The author **accepts no responsibility whatsoever**. AS IS. See [DISCLAIMER.md](DISCLAIMER.md). |
| Conservar atribución MIT / `NOTICE` del trabajo derivado de watermarks-remover. | Preserve MIT attribution / `NOTICE` for derived work from watermarks-remover. |

Un informe de limpio **no** significa «nunca hubo IA» ni «indetectable ante un detector de proveedor».
A clean report does **not** mean “never AI-assisted” or “undetectable to a vendor detector”.

---

## 1. Elección de upstream / Upstream choice

### Por qué watermarks-remover / Why watermarks-remover

**Elegido:** [guillaumemeyer/watermarks-remover](https://github.com/guillaumemeyer/watermarks-remover) (~20 029★, MIT, última release **v0.7.0**).

| Criterio / Criterion | Hecho / Fact |
| --- | --- |
| Popularidad | ~20k★, el más estrellado de esta clase |
| Licencia | MIT — permite derivado + NOTICE |
| Contrato HTTP | `server.py` stdlib: `/health` `/inspect` `/clean` (+ `/capabilities` `/detect` `/openapi.json` y lotes) |
| Imagen | `ghcr.io/guillaumemeyer/watermarks-remover:<tag>` / `:latest` — servicio HTTP + exiftool / qpdf / c2patool / ffmpeg / ghostscript |
| Honestidad | Capa A vs B vs metadatos vs píxel documentada; ética explícita |
| Host | Skill = cliente HTTP delgado; no hace falta Python en el Worker |

**No vendemos el árbol Python.** Dependemos de:

1. **Navegador:** portar (no copiar un repo entero) `text_unicode.py` / `image_meta.py` / `av_meta.py` a JS/TS, con tests de paridad contra un *checkout* local de upstream (como hace unmark-web).
2. **Servidor v1:** HTTP + imagen Docker. `FROM ghcr.io/guillaumemeyer/watermarks-remover`.

**UI de referencia (no afiliada):** [ivanusto/unmark-web](https://github.com/ivanusto/unmark-web) (MIT, ~7★). Cliente *browser-first* independiente; el maintainer de upstream pidió el cambio de nombre para que no parezca componente oficial. FocAIRemover **no** es un fork de unmark-web. Copiamos el *patrón* (local primero, proxy same-origin, Inspector separado, copy honesto), no el marketing ni la identidad.

**We do not vendor the Python tree.** Depend on:

1. **Browser:** port (do not copy an entire repo) `text_unicode.py` / `image_meta.py` / `av_meta.py` to JS/TS, with parity tests against a local upstream checkout (as unmark-web does).
2. **Server v1:** HTTP + Docker image. `FROM ghcr.io/guillaumemeyer/watermarks-remover`.

**UI reference (not affiliated):** unmark-web. Independent browser-first client. FocAIRemover is **not** a fork. Copy the *pattern* (local-first, same-origin proxy, separate Inspector, honest copy), not branding.

### Alternativas descartadas / Alternatives not chosen

| Proyecto | Por qué no / Why not |
| --- | --- |
| Forks menores de watermarks-remover | Menos estrellas, mismo motor |
| [maxgfr/unmark](https://github.com/maxgfr/unmark) | Excelente honestidad, otro stack; no es el upstream de 20k★ ni la imagen GHCR |
| CtrlRegen / reverse-SynthID | GPU, licencias incompatibles o research-only; fuera de alcance |

---

## 2. Qué hace cada capa / What each cleaning layer does

Tabla alineada con el README upstream (capas A / B / Files) y con unmark-web (carácter / metadatos / estadístico).

Table aligned with upstream (layers A / B / Files) and unmark-web (character / metadata / statistical).

### Capa A — Unicode invisible / Layer A — invisible Unicode

**Verificable.** Scripts deterministas (`text_unicode.py` → port JS).

Quita (lista operativa para el implementador; seguir tablas de upstream, no reinventar):

- Espacios de ancho cero, controles bidi, *variation selectors* sueltos, *tag characters*, PUA, no-caracteres Unicode, default-ignorables reservados, otros `Cf`
- Homoglifos de espacio
- Opcional: NFKC, *confusables* latinos, modo «paranoico»

**Conservar** invisibles con función (ZWJ/VS16 de emoji, ZWNJ persa/índico, tags de banderas, FVS mongol, vocales jémer, fillers hangul, Cf árabe, controles de layout junto a su escritura). unmark-web y upstream coinciden aquí; un desliz corrompe texto legítimo.

**No quita** marcas de muestreo de tokens. Re-inspeccionar tras limpiar: los detectores estadísticos no deben moverse.

**Does not remove** token-sampling marks. Re-inspect after clean: statistical detectors must not move.

Archivos de texto / `.txt` / pegado: Capa A en el **navegador** (MVP).
Markdown/HTML/SVG en el navegador: Capa A **solo sobre el texto**; frontmatter/`<meta>`/XMP de contenedor requieren servidor (v1).

### Capa B — marcas estadísticas de texto / Layer B — statistical text watermarks

**Solo mejor esfuerzo. No certificable.**

La señal vive en **la elección de palabras**, no en caracteres. Paraphrase / back-translation / humanize la *debilitan*. No hay borrado.

**Only best-effort. Not certifiable.**

The signal lives in **word choice**, not characters. Paraphrase / back-translation / humanize *weaken* it. There is no delete.

Upstream v0.7.0: `POST /clean` sobre **texto plano** aplica Capa B por defecto (`config/clean_strategy.json`, p.ej. `paraphrase@0.8,mlm@0.2`) y responde **HTTP 400** si el backend no está configurado (`WATERMARKS_REWRITE_*`, `transformers`+`roberta-large` para `mlm`).

**PDF/DOCX/HTML/MD se limpian como contenedores** (metadatos + Capa A) y **no** ejecutan Capa B en `/clean`. Extraer prosa y mandarla como `.txt` si se quiere B.

**Nunca reescribir texto Claude con Claude** (ni Gemini con Gemini): se puede re-estampar. Modelo **no origen**, OpenAI-compatible o Workers AI.

Google retiró el detector SynthID-text de su API (ago 2026). El detector `claude-text` de upstream es un **hueco** hasta que Anthropic publique API. MarkLLM es same-config, no oráculo de proveedor.

**FocAIRemover v1 no configura Capa B en el contenedor.** El texto se limpia en el cliente (A). B = v1.5, etiquetada «mejor esfuerzo».

### Archivos — C2PA / EXIF / XMP / props / Files

**Verificable a nivel de contenedor** (acciones en el informe). **No** cubre *soft binding* C2PA ni marcas en el dominio del píxel.

| Formato / Format | MVP navegador / Browser MVP | v1 contenedor / v1 container |
| --- | --- | --- |
| PNG JPEG WebP AVIF HEIC BMP GIF TIFF | Sí — port `image_meta.py`. No re-encode de píxeles. AVIF/HEIC: caja ISOBMFF → `free` del mismo tamaño (offsets). | Igual + herramientas de sistema |
| MP4 MOV M4A M4V WAV MP3 FLAC | Sí — port `av_meta.py`. `File.slice()`; no cargar el media entero. | Igual |
| PDF DOCX XLSX PPTX ODT EPUB | No | Sí — exiftool/qpdf/c2patool en la imagen. PDF `deep_images`: `auto` \| `always` \| `lossless` \| `never` |
| MD HTML SVG (contenedor) | Solo Capa A del texto | Limpieza completa de contenedor |

Píxeles **intocados** en MVP. `remove_pixel` (CtrlRegen / diffusion) = fuera de alcance (GPU, imagen CtrlRegen sin LICENSE publicada).

---

## 3. Arquitectura Cloudflare por fases / Cloudflare architecture by phase

```
MVP (sin contenedor)
  Navegador ── Layer A + image/AV strip ── descarga local
  Worker ── Static Assets (apps/web) + 501 en /api/*
  Datos: bytes del fichero en la pestaña; logs de red/CDN/Worker posibles

v1
  Navegador ── same-origin /api/* ── Worker (límites, auth, rate limit)
                                   └── Container defaultPort 8765
                                       ghcr.io/guillaumemeyer/watermarks-remover
                                       GET /health  POST /inspect  POST /clean
  Datos: el fichero SALE de la máquina. Uploads/logs/copias PUEDEN persistirse.

v1.5
  + R2 para ficheros grandes (no buffer JSON+base64 en el isolate de 128 MiB)
  + Capa B vía API OpenAI-compatible no-Claude o Workers AI
  Datos: objetos en R2 y texto enviado al modelo PUEDEN persistirse.
```

### MVP — UI estática + todo en el navegador / Static UI + browser-side clean

**Hipótesis confirmada:** el MVP **puede** publicarse **sin** contenedor. unmark-web lo demuestra: Capa A + metadatos de imagen/AV en JS, sin uploads.

**Hunch confirmed:** MVP **can** ship **without** a container.

Stack:

- **Workers Static Assets** (`assets.directory = apps/web`), no hace falta un proyecto Pages aparte.
- Worker mínimo: `run_worker_first` para reservar `/api/*`; el resto → `ASSETS`.
- Motores JS: portar desde upstream (paridad). No commitear el árbol Python; CI puede clonar watermarks-remover para tests.
- UI: dropzone, pestaña texto, pestaña archivos, informe (confirmed / probable / informational). Copy de honestidad al mismo peso que «qué quita».
- Límite práctico en página: ~64 MiB para inspect de imagen (unmark-web); AV por slices sin ese tope.
- CSP estricta. `connect-src 'self'` en MVP (sin servidor).

Fuera del MVP: PDF/DOCX, Capa B, `/detect` de servidor, GPU.

### v1 — Worker proxy + Cloudflare Containers

**Hipótesis confirmada con un matiz:** Cloudflare Containers **pueden** ejecutar la imagen upstream, **no** poniendo `image: "ghcr.io/..."` en Wrangler (GHCR no está en la lista de pre-built: Cloudflare Registry, Docker Hub, ECR, GAR). El camino soportado: **Dockerfile `FROM ghcr.io/guillaumemeyer/watermarks-remover`** (`containers/cleaner/`) y `wrangler deploy` construye y sube al registry de Cloudflare. Arquitectura **linux/amd64** (requisito de Containers; la imagen core ya es amd64).

**Hunch confirmed with a caveat:** Containers **can** host the upstream image via a wrapping Dockerfile, not a raw GHCR image reference.

Contrato Worker (`@cloudflare/containers`):

```ts
export class CleanerContainer extends Container {
  defaultPort = 8765;      // EXPOSE + CMD --host 0.0.0.0
  sleepAfter = "10m";
  enableInternet = false;  // core clean no necesita red
}
```

- `getContainer(env.CLEANER, "shared")` o un id por request si se aísla CPU.
- `instance_type`: **`basic`** de entrada (lite se queda corto con ffmpeg/ghostscript/qpdf + Python). Subir a `standard-1` si PDF+`deep_images` hace OOM.
- `max_instances`: empezar en 2–3.
- Cold start típico 1–3 s; el Worker espera a que el puerto 8765 acepte conexiones.

**Qué enviar al contenedor en v1:** PDF, Office, EPUB, ODT, HTML/SVG/MD *como contenedor*. Texto pegado y PNG/JPEG/… siguen en el cliente.

**Qué no enviar:** `.txt` a `/clean` hasta v1.5 — v0.7.0 exige Capa B y devolverá 400 sin `WATERMARKS_REWRITE_*`.

**Memoria del Worker:** isolate **128 MiB**. Upstream `WATERMARKS_MAX_INPUT_BYTES` default = **256 MiB** → el JSON+base64 no cabe. El stub de Dockerfile baja el cap a **16 MiB**. Preferir *stream* `containerFetch(request)` frente a `arrayBuffer()` del body completo. Plan de cuenta Cloudflare: body de request **100 MiB** (Free/Pro) — el cuello de botella real es la RAM del isolate, no el plan.

`server.py` **no envía CORS** (issue #77 / PR #78). El proxy es same-origin. **Prohibido** `Access-Control-Allow-Origin: *` en `/api`.

### v1.5 opcional — R2 + Capa B

- **R2:** PUT (URL prefirmada o stream del Worker) → el contenedor lee → PUT resultado → descarga. El bucket **puede** retener objetos para investigación u operación. Un TTL operativo, si se configura, **no** es una garantía al usuario ni impide copias fuera de R2.
- **Capa B:** `WATERMARKS_REWRITE_BACKEND=openai-compatible` + `WATERMARKS_REWRITE_ALLOW_REMOTE=1` **o** el Worker llama a Workers AI / un endpoint propio. El texto reescrito **se envía a un tercero** (proveedor del modelo). UI: «mejor esfuerzo / no certificable». Modelo ≠ origen.
- No Claude para texto sospechoso de Claude.

### Fuera de alcance inicial / Out of scope initially

- SynthID de píxeles / CtrlRegen / DiffusionPurification (GPU; CtrlRegen sin LICENSE en upstream; reverse-SynthID = research no comercial).
- Detector oficial Anthropic (`claude-text` placeholder).
- MarkLLM / MarkDiffusion (imágenes extra `:markllm-latest` / `:markdiffusion-latest`; same-config).
- Audio *purify* destructivo (`remove_audio_watermark`) y *pixel purify* de vídeo.
- Afirmar eliminación de *soft binding* C2PA.

---

## 4. Superficie API / API surface (mapeo upstream)

Base internamente: `http://127.0.0.1:8765` en el contenedor. Públicamente: `https://<worker>/api/...` (el Worker recorta `/api`).

Payloads: JSON, fichero en **base64**, campo `name` con extensión real (el despacho usa extensión + magic bytes).

| Método | Upstream | Worker público | Cuerpo | Respuesta |
| --- | --- | --- | --- | --- |
| `GET` | `/health` | `/api/health` | — | `{"ok": true, "version": "..."}` |
| `GET` | `/capabilities` | `/api/capabilities` | — | tools / scorers / text_detectors / pixel_backends (sondeados de verdad, no solo PATH) |
| `GET` | `/openapi.json` | `/api/openapi.json` | — | OpenAPI 3.0.3 generado |
| `POST` | `/inspect` | `/api/inspect` | `{"file": "<b64>", "name": "notes.md"}` opcional `"detect": true` | `{"ok", "kind", "suspicious", "report"}` |
| `POST` | `/detect` | `/api/detect` | igual | `{"ok", "kind", "detections": [...]}` — v1 puede 501 hasta que haya detectores |
| `POST` | `/clean` | `/api/clean` | `{"file", "name", "options": {...}}` | `{"ok", "kind", "cleaned": "<b64>", "report"}` |
| `POST` | `/inspect/batch` `/clean/batch` `/detect/batch` | opcional v1.5 | `{"files":[...]}` | cap `WATERMARKS_MAX_BATCH_FILES` (default 50; stub = 8) |

`kind: "unknown"` en inspect; **400** en clean si el formato no se reconoce.

### `options` de `/clean` (allowlist de `server.py`)

| Opción | Tipo | Notas |
| --- | --- | --- |
| `nfkc` | bool | texto |
| `aggressive_homoglyphs` | bool | texto |
| `normalize_spaces` | bool | `false` para tipografía francesa `« »` `; : ! ?` |
| `keep_non_ai_metadata` | bool | solo bloques con pistas IA/C2PA |
| `strip_all_metadata` | bool | |
| `also_layer_a_text` | bool | contenedores |
| `remove_pixel` | str | `ctrlregen` \| `diffusion` — **no exponer en v1** |
| `remove_audio_watermark` | bool | **no exponer** (destructivo, sale M4A) |
| `detect_before` / `detect_after` | bool | informe; no bloquea el clean |
| `deep_images` | str | PDF: `auto` \| `always` \| `lossless` \| `never` |
| `style` | str | Capa B |
| `strategy` | str | p.ej. `paraphrase@0.8,mlm@0.2` — v1.5 |

Auth upstream: si `WATERMARKS_SERVER_API_KEY` está definido, `Authorization: Bearer <key>` en **todas** las rutas. El Worker debe inyectar el secreto (`wrangler secret put`); **no** reenviar el Bearer del navegador al contenedor.

Ejemplo (local, no producción):

```bash
WM=http://127.0.0.1:8765
curl -s "$WM/health"
curl -s -X POST "$WM/inspect" -H 'Content-Type: application/json' \
  -d "{\"file\": \"$(base64 < notes.pdf | tr -d '\n')\", \"name\": \"notes.pdf\"}"
curl -s -X POST "$WM/clean" -H 'Content-Type: application/json' \
  -d "{\"file\": \"$(base64 < notes.pdf | tr -d '\n')\", \"name\": \"notes.pdf\"}"
```

---

## Datos por fase / Data by phase

**Regla:** los datos **pueden guardarse**. No documentar «se borra al instante» ni «nunca sale de tu PC» salvo donde sea **técnicamente cierto** (bytes del fichero en el MVP del navegador). Investigación / operación **pueden** conservar copias. Texto vinculante: [DISCLAIMER.md](DISCLAIMER.md).

**Rule:** **data may be stored.** Do not document “deleted instantly” or “never leaves your PC” except where that is **technically true** (file bytes in the browser MVP). Research / operations **may** keep copies.

| Fase | Bytes del fichero del usuario | Logs y metadatos de uso | Copias para investigación |
| --- | --- | --- | --- |
| **MVP (navegador)** | Se quedan en la pestaña. No hay `POST` al cleaner. La descarga es local. | **Sí, posibles:** Cloudflare/Workers al servir HTML/JS (IP, URL, User-Agent, `cf-ray`, estado). `observability` está previsto en `wrangler.jsonc`. | No hay upload que archivar. Los logs de petición **sí** pueden conservarse. |
| **v1 (Worker + contenedor)** | **Salen de la máquina.** JSON+base64 (o stream) hacia el Worker y el contenedor en 8765. Disco del contenedor efímero **no** equivale a «no se guarda»: el Worker puede loguear, un operador puede persistir body o informe. | **Sí:** talla, `kind`, códigos, IP, timestamps, errores. No hay compromiso de no loguear el contenido. | **Sí, permitido.** Uploads, `cleaned`, `report` y metadatos **pueden** archivarse. Sin SLA de borrado ni de acceso del usuario a «borrar mis datos». |
| **v1.5 (R2 + Capa B)** | **Salen de la máquina** y además pueden vivir en un bucket R2. | Igual que v1, más eventos de objeto (PUT/GET/DELETE). | **Sí.** R2 y el proveedor del modelo de reescritura (Workers AI u OpenAI-compatible) pueden retener texto o ficheros según *su* política, más copias del proyecto. |

Implementación: la UI debe decir esto **antes** del primer `/clean` de servidor (checkbox o banner, no un footnote). El MVP debe decir que los bytes no se suben **y** que igual hay logs de la página.

Do **not** restore the old TOS line that claimed v1 is ephemeral-only except R2.

---

## 5. Seguridad / Security

| Control | MVP | v1 |
| --- | --- | --- |
| Subida | No hay | Solo same-origin `/api`; tope **16 MiB** decodificado (env del contenedor + chequeo Worker) |
| Rate limit | N/A | Workers Rate Limiting GA (`ratelimits` en wrangler), p.ej. 20 req/min/IP en `/api/clean` |
| CORS | N/A (todo local) | Lista de orígenes (`ALLOWED_ORIGIN`). **Nunca `*`** en el API del cleaner |
| Auth | N/A | Bearer opcional `CLEANER_API_KEY` en el Worker; opcionalmente `WATERMARKS_SERVER_API_KEY` dentro del contenedor |
| ToS / ética / descargo | UI + [ETHICS.md](ETHICS.md) + [TOS.md](TOS.md) + [DISCLAIMER.md](DISCLAIMER.md) | Banner de investigación + datos + descargo **antes** del primer `/clean` de servidor |
| Aislamiento | JS en el tab (fichero no sube) | `enableInternet = false`; uid 10001. Disco efímero **no** implica no retención |
| Secretos | — | `.dev.vars` local; `wrangler secret put` en prod. Nunca en `wrangler.jsonc` |
| Datos / logs | Logs de petición al servir estáticos | Uploads y metadatos **pueden** persistirse (investigación / operación). Ver [Datos por fase](#datos-por-fase--data-by-phase) |

`MAX_BODY_BYTES` upstream = `MAX_INPUT_BYTES + MAX_INPUT_BYTES/2` (overhead base64). El Worker debe rechazar `Content-Length` por encima **antes** de leer el body.

---

## 6. Checklist de implementación / Implementation checklist

### Ya hecho en este PR / Done in this PR

- [x] `docs/PLAN.md` (este archivo)
- [x] README + NOTICE + LICENSE MIT + ETHICS + TOS + DISCLAIMER
- [x] `apps/web` stub + `apps/worker` stub + `containers/cleaner/Dockerfile`
- [x] `wrangler.jsonc` (assets ahora; containers/R2 comentados)

### MVP (siguiente agente) / MVP (next agent)

- [ ] Portar `text_unicode.py` → `apps/web/src/layer_a.ts` (o `.js`) con las mismas tablas de keep/strip
- [ ] Portar `image_meta.py` → inspect/strip PNG/JPEG/WebP/AVIF/HEIC/BMP/GIF/TIFF
- [ ] Portar `av_meta.py` → MP4/MOV/M4A/M4V/WAV/MP3/FLAC con driver `File.slice()`
- [ ] Tests de paridad: clonar upstream en CI, **no** venderlo; fallar si el hash de fuentes se desvía (patrón `scripts/upstream-sources.json` de unmark-web)
- [ ] UI dropzone: inspect → mostrar hallazgos → clean → descarga `*.cleaned.*`
- [ ] Copy de honestidad (tabla de este PLAN) visible junto a la dropzone, no en un footnote
- [ ] Banner visible: investigación / experimental; datos pueden guardarse; enlace a DISCLAIMER
- [ ] Re-inspect post-clean para Capa A / metadatos (prueba verificable)
- [ ] i18n ES+EN
- [ ] `npm run dev` sirve la UI; `/api/*` sigue en 501
- [ ] Sin `Access-Control-Allow-Origin: *`

### v1

- [ ] Descomentar `containers` / `durable_objects` / `migrations` en wrangler
- [ ] `CleanerContainer` `defaultPort = 8765`
- [ ] Proxy `/api/health|capabilities|inspect|clean` → contenedor
- [ ] Pin de tag GHCR (no `:latest` en prod)
- [ ] Rate limit + tope de talla + Bearer opcional
- [ ] Enrutar PDF/DOCX/… al servidor; texto e imagen raster al cliente
- [ ] No enviar `.txt` a `/clean` hasta Capa B
- [ ] Comprobar `GET /capabilities` (`exiftool`, `qpdf`, `c2patool`, `ghostscript`) antes de prometer PDF profundo

### v1.5

- [ ] R2 + stream; no buffer de 256 MiB
- [ ] Capa B no-Claude; UI «mejor esfuerzo»
- [ ] R2 operativo; documentar que objetos y logs **pueden** retenerse (sin vender TTL como privacidad)

### Nunca en el alcance inicial / Never in initial scope

- [ ] CtrlRegen / SynthID píxel / detector Anthropic como feature de producto
- [ ] Claims de «garantizado» / «indetectable» / «escrito por humano»

---

## 7. Cómo implementar el MVP sin reinvestigar / MVP notes for the next agent

1. **Clonar upstream al lado, no dentro del repo:**
   `git clone --depth 1 --branch v0.7.0 https://github.com/guillaumemeyer/watermarks-remover.git /tmp/watermarks-remover`
2. **Módulos a portar (solo estos):**
   - `service/scripts/text_unicode.py` — `clean`, `inspect`, `decide`
   - `service/scripts/image_meta.py`
   - `service/scripts/av_meta.py`
   - helpers mínimos de `common.py` (`classify_finding_confidence`, `_contains_any`) — unmark-web usa *slices* de hash para no seguir todo el archivo
3. **No portar:** `server.py`, rewrite/Layer B, MarkLLM, CtrlRegen, PDF/DOCX.
4. **Paridad:** mismos bytes de salida en fixtures de PNG/JPEG/texto con ZWSP. Si no hay `node`+checkout, skip (no pass silencioso).
5. **UI:** dropzone primero; explicación, datos y descargo debajo (unmark-web v0.6.1: el texto arriba empuja la herramienta fuera de la primera pantalla). Investigación / experimental, «datos pueden guardarse» y enlace a `docs/DISCLAIMER.md` tienen que verse, no quedar en un footnote.
6. **Despacho de formatos (MVP):**
   - text/* pegado, `.txt` → Capa A local
   - imagen raster + AV listados → meta local
   - `.pdf` `.docx` `.xlsx` `.pptx` `.odt` `.epub` → mensaje «v1 / servidor», no fingir un strip
7. **Dependencia runtime del MVP:** cero Python, cero contenedor. Solo estáticos + Worker 501.

---

## 8. Hipótesis verificadas / Verified hunches

| Hipótesis / Hunch | Resultado / Result |
| --- | --- |
| Cloudflare Containers pueden hospedar la imagen Docker upstream | **Sí**, envolviendo con Dockerfile `FROM ghcr.io/...` y deploy de Wrangler al registry de Cloudflare. Referencia GHCR cruda: **no** (lista de pre-built). Imagen **linux/amd64**, coincide con Containers. |
| El MVP de navegador puede salir sin contenedor | **Sí.** Capa A + imagen/AV en el cliente. El Worker solo sirve estáticos. PDF/DOCX esperan a v1. |

---

## 9. Referencias / References

- https://github.com/guillaumemeyer/watermarks-remover (v0.7.0, MIT)
- https://github.com/guillaumemeyer/watermarks-remover/blob/main/skills/remove-ai-marks/references/ethics.md
- https://github.com/guillaumemeyer/watermarks-remover/blob/main/service/Dockerfile
- https://github.com/ivanusto/unmark-web (inspiración UI, no afiliado)
- https://developers.cloudflare.com/containers/
- https://developers.cloudflare.com/containers/guides/image-management/
- https://developers.cloudflare.com/workers/static-assets/
- https://developers.cloudflare.com/workers/platform/limits/
