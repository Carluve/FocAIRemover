# `apps/worker` — proxy Worker

Placeholder Worker. MVP: sirve `apps/web` (Static Assets) y responde **501**
en `/api/*` hasta que exista el contenedor.

Placeholder Worker. MVP: serves `apps/web` (Static Assets) and returns **501**
on `/api/*` until the container exists.

## v1

Implementar `CleanerContainer extends Container` (`@cloudflare/containers`):

- `defaultPort = 8765`
- `sleepAfter = "10m"`
- `enableInternet = false` (el cleaner core no necesita salida)
- Proxy same-origin: `GET/POST /api/health|capabilities|inspect|clean|…` → contenedor sin el prefijo `/api`
- Límites de tamaño, rate limit, Bearer opcional, **sin CORS `*`**
- No reenviar `Authorization` del navegador al contenedor si el Bearer es del Worker

See [docs/PLAN.md](../../docs/PLAN.md).
