/** Port the upstream watermarks-remover HTTP service listens on. */
export const CLEANER_PORT = 8765;

/**
 * Cloudflare Containers integration (enterprise account).
 *
 * 1. `npm i @cloudflare/containers`
 * 2. Replace this module with:
 *
 *    import { Container } from "@cloudflare/containers";
 *    export class CleanerContainer extends Container {
 *      defaultPort = 8765;
 *      sleepAfter = "10m";
 *      enableInternet = false;
 *    }
 *
 * 3. Uncomment `containers` / `durable_objects` / `migrations` in wrangler.jsonc
 * 4. `export { CleanerContainer } from "./container"` from index.ts
 * 5. `npx wrangler deploy` (Docker required to build containers/cleaner/Dockerfile)
 *
 * Until then, set CLEANER_URL=http://127.0.0.1:8765 and `docker compose up`.
 */
