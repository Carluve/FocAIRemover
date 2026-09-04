export type JsonBody = Record<string, unknown>;

export function json(body: unknown, status: number, extra: HeadersInit = {}): Response {
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

export function requireBearer(request: Request, apiKey: string | undefined): Response | null {
  const expected = apiKey?.trim();
  if (!expected) return null;
  const header = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match || match[1] !== expected) {
    return json({ ok: false, error: "unauthorized", message: "missing or invalid bearer token" }, 401);
  }
  return null;
}
