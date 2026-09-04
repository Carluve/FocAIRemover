# apps/web — UI drag-and-drop (MVP)

Placeholder for the browser-first cleaner. Served as Workers Static Assets
(`wrangler.jsonc` → `assets.directory`).

## Qué va aquí / What lands here

Patrón como [unmark-web](https://github.com/ivanusto/unmark-web) (inspiración de UI, **no afiliado**):

- Arrastrar/soltar + pegar texto.
- **Capa A** (Unicode invisible) y strip de metadatos de imagen/AV **en el cliente**.
- Informe honesto: verificable vs. no certificable.
- Banner visible: investigación / experimental; datos pueden guardarse; descargo (`docs/DISCLAIMER.md`).
- Sin subidas de fichero en el MVP. Sin analytics de terceros. Sin CORS hacia el cleaner. Los logs de Cloudflare/Workers al servir la página **sí pueden** existir.

Pattern like [unmark-web](https://github.com/ivanusto/unmark-web) (UI inspiration, **not affiliated**):

- Drag-and-drop + paste.
- **Layer A** (invisible Unicode) and image/AV metadata strip **in the browser**.
- Honest report: verifiable vs. not certifiable.
- Visible research + data-may-be-stored + disclaimer banner.
- No file uploads in MVP. No third-party analytics. No CORS to the cleaner. Request logs **may** still exist.

## Qué no va aquí / What does not

- Árbol Python de watermarks-remover.
- PDF/DOCX (eso es v1 → Worker → contenedor `/clean`).
- Capa B / detector Anthropic / SynthID de píxeles.

- Upstream Python tree.
- PDF/DOCX (v1 → Worker → container `/clean`).
- Layer B / Anthropic detector / pixel SynthID.

Implementación: [docs/PLAN.md](../../docs/PLAN.md) fase MVP.

Local: `npm install && npm run dev` from the repo root, then open the URL Wrangler prints (typically `http://127.0.0.1:8787`).
