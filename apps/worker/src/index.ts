/**
 * FocAIRemover Worker stub.
 *
 * MVP: Static Assets (apps/web) handle the UI. Browser-side Layer A +
 * image/AV metadata strip do not need this Worker for cleaning.
 *
 * v1: proxy /api/* to the Cloudflare Container running watermarks-remover
 * on port 8765. Do not add Access-Control-Allow-Origin: *.
 *
 * See docs/PLAN.md.
 */

export interface Env {
  ASSETS: Fetcher;
  ALLOWED_ORIGIN: string;
  ENVIRONMENT: string;
  // v1:
  // CLEANER: DurableObjectNamespace;
  // CLEAN_RATE_LIMITER: RateLimit;
  // CLEANER_API_KEY?: string;
}

const API_PREFIX = "/api";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api" || url.pathname.startsWith(`${API_PREFIX}/`)) {
      return json(
        {
          ok: false,
          error: "cleaner_not_deployed",
          message:
            "Server-side /clean (PDF, DOCX, full pipeline) ships in v1 via Cloudflare Containers. Browser MVP does not upload files.",
          plan: "/docs/PLAN.md",
        },
        501,
      );
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      // Same-origin UI. Do not add ACAO *.
      "x-content-type-options": "nosniff",
    },
  });
}

// v1 sketch (do not uncomment without the containers binding):
//
// import { Container, getContainer } from "@cloudflare/containers";
//
// export class CleanerContainer extends Container {
//   defaultPort = 8765;
//   sleepAfter = "10m";
//   enableInternet = false;
// }
//
// const container = getContainer(env.CLEANER, "shared");
// return container.fetch(rewrittenRequestToPort8765);
