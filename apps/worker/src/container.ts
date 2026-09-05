/** Port the upstream watermarks-remover HTTP service listens on. */
export const CLEANER_PORT = 8765;

/**
 * Cloudflare Containers integration (enterprise account).
 *
 * Enable in one deploy (Docker required on the machine that runs wrangler):
 *
 * 1. `npm i @cloudflare/containers`
 * 2. Replace this module's stub with:
 *
 *    import { Container } from "@cloudflare/containers";
 *    export class CleanerContainer extends Container {
 *      defaultPort = 8765;
 *      sleepAfter = "10m";
 *      enableInternet = false;
 *      pingEndpoint = "http://localhost:8765/health";
 *    }
 *
 * 3. Uncomment `containers` / `durable_objects` / `migrations` in wrangler.jsonc
 * 4. `export { CleanerContainer } from "./container"` from index.ts
 * 5. `npx wrangler deploy` (builds containers/cleaner/Dockerfile → CF registry)
 *
 * Until then:
 * - Worker Layer A cleans .txt / .md / .html / .svg in-process (no container).
 * - PDF / Office / raster / AV need CLEANER_URL (reachable from the Worker)
 *   or the container binding above.
 *
 * Local: CLEANER_URL=http://127.0.0.1:8765 and `docker compose up`.
 */
export {};
