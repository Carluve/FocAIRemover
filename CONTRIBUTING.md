# Contribuir / Contributing

FocAIRemover es un **proyecto de investigación**. El copy debe seguir siendo honesto.

## Cómo probar

```bash
cp .dev.vars.example .dev.vars
npm install
npm run migrate:local
npm test
npx wrangler dev
node scripts/smoke.mjs
```

Opcional: `docker compose up --build -d` y deja `CLEANER_URL=http://127.0.0.1:8765` para PDF/imagen en local.

## Reglas de producto

- **No** afirmar «Anthropic watermark guaranteed removed» ni equivalentes en ES.
- El descargo ([docs/DISCLAIMER.md](docs/DISCLAIMER.md)) y el aviso de **datos pueden guardarse** tienen que seguir accesibles en la UI (colapsable está bien; ocultarlos no).
- CORS **nunca** `*`.
- Solo cuenta Cloudflare **enterprise** `39f8ea10b94ad38470fc3c20c260efdc`. El script `npm run deploy` rechaza la personal.
- No vender el árbol Python de watermarks-remover; conservar [NOTICE](NOTICE).

## PRs

`npm test` en verde. Si tocas UI, verifica dropzone / error / retry / descarga en desktop y móvil. Si tocas el cleaner, `GET /api/health` debe distinguir Capa A de cleaner remoto.
