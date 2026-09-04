/**
 * Cloudflare Container running upstream watermarks-remover.
 *
 * The container is the only component that can strip C2PA/EXIF/XMP metadata and
 * clean images, PDFs and Office containers; the Worker handles plain .txt on its
 * own (see `./layer-a/`). Without this bound, every non-.txt job fails with
 * `cleaner_not_configured`.
 *
 * Enabling it is three coordinated edits — the class alone does nothing:
 *   1. uncomment `containers` / `durable_objects` / `migrations` in wrangler.jsonc
 *   2. uncomment `export { CleanerContainer } from "./container"` in index.ts
 *   3. `npm run deploy` with Docker running, so Wrangler can build
 *      containers/cleaner/Dockerfile and push it to the enterprise registry
 *
 * Upstream listens on 0.0.0.0:8765 (`service/Dockerfile`: ENTRYPOINT python3,
 * CMD scripts/server.py --host 0.0.0.0), which is why defaultPort is 8765.
 *
 * Upstream: https://github.com/guillaumemeyer/watermarks-remover (MIT)
 */

import { Container } from "@cloudflare/containers";

/** Port upstream's HTTP service listens on. */
export const CLEANER_PORT = 8765;

export class CleanerContainer extends Container {
  defaultPort = CLEANER_PORT;

  /**
   * Cleaning is bursty: a few jobs, then nothing. Sleeping releases the
   * instance instead of billing an idle one, at the cost of a cold start on the
   * next job — which the queue absorbs.
   */
  sleepAfter = "10m";

  /**
   * The cleaner only ever reads bytes the Worker hands it. It has no reason to
   * reach the internet, and denying it limits what a compromised dependency in
   * that Python tree could do.
   */
  enableInternet = false;

  override onStart(): void {
    console.log(JSON.stringify({ ts: Date.now(), msg: "cleaner_container_start" }));
  }

  override onError(error: unknown): never {
    console.log(
      JSON.stringify({
        ts: Date.now(),
        msg: "cleaner_container_error",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    throw error;
  }
}
