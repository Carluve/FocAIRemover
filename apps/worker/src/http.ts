import { timingSafeEqual } from "node:crypto";

export type JsonBody = Record<string, unknown>;

export function json(body: unknown, status = 200, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...Object.fromEntries(new Headers(extra)),
    },
  });
}

/**
 * CORS: same-origin always; ALLOWED_ORIGIN if it matches. Never "*".
 */
export function allowCorsOrigin(request: Request, allowedOrigin: string): string | null {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  try {
    const reqUrl = new URL(request.url);
    const sameOrigin = `${reqUrl.protocol}//${reqUrl.host}`;
    if (origin === sameOrigin) return origin;
  } catch {
    /* ignore */
  }
  if (allowedOrigin && origin === allowedOrigin) return origin;
  return null;
}

export function withCors(response: Response, origin: string | null): Response {
  if (!origin) return response;
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set("vary", "Origin");
  headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
  headers.set("access-control-allow-headers", "authorization, content-type, idempotency-key");
  headers.set("access-control-max-age", "600");
  return new Response(response.body, { status: response.status, headers });
}

export function optionsResponse(origin: string | null): Response {
  return withCors(new Response(null, { status: 204 }), origin);
}

export function clientError(code: string, message: string, status = 400): Response {
  return json({ ok: false, error: code, message }, status);
}

export function logEvent(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ ts: Date.now(), ...fields }));
}

export function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") || "local";
}

export function timingSafeEqualString(left: string, right: string): boolean {
  const enc = new TextEncoder();
  const a = enc.encode(left);
  const b = enc.encode(right);
  if (a.byteLength !== b.byteLength) return false;
  return timingSafeEqual(a, b);
}

export function bearerToken(request: Request): string | null {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") || "");
  return match?.[1] ?? null;
}

/**
 * Auth gate. Fails CLOSED: an unset API_KEY is only allowed when the operator
 * has opted into anonymous access (PUBLIC_UPLOADS), never by accident.
 *
 * - API_KEY set              -> a matching bearer is required.
 * - unset + allowAnonymous   -> open on purpose; surfaced in /api/health.
 * - unset + !allowAnonymous  -> 503, because the deploy is misconfigured.
 */
export function requireBearer(
  request: Request,
  apiKey: string | undefined,
  opts: { allowAnonymous: boolean },
): Response | null {
  const expected = apiKey?.trim();
  if (!expected) {
    if (opts.allowAnonymous) return null;
    return json(
      {
        ok: false,
        error: "server_misconfigured",
        message:
          "no API_KEY secret is set. Run `wrangler secret put API_KEY`, or set PUBLIC_UPLOADS=true to serve this API anonymously on purpose.",
      },
      503,
    );
  }
  const token = bearerToken(request);
  if (!token || !timingSafeEqualString(token, expected)) {
    return json({ ok: false, error: "unauthorized", message: "missing or invalid bearer token" }, 401);
  }
  return null;
}

/**
 * Stable, non-reversible caller id used to scope idempotency keys so one
 * caller can never replay into another caller's job. Bearer token when
 * present (distinguishes API clients), client IP otherwise.
 */
export async function callerFingerprint(request: Request, apiKey: string | undefined): Promise<string> {
  const token = bearerToken(request);
  const seed = token && apiKey ? `key:${token}` : `ip:${clientIp(request)}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
