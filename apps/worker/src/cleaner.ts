/**
 * Remote cleaner HTTP client (Containers or CLEANER_URL).
 *
 * Preferred: Cloudflare Container binding (CLEANER Durable Object) talking to
 * watermarks-remover on port 8765. Enable CleanerContainer export + wrangler
 * containers block (see docs/DEPLOY.md).
 * Fallback: CLEANER_URL (must be reachable from the Worker — not laptop
 * localhost in production).
 */

import { Buffer } from "node:buffer";

export type CleanerResult =
  | {
      ok: true;
      kind: string;
      cleaned: Uint8Array;
      report: unknown;
    }
  | {
      ok: false;
      status: number;
      error: string;
      detail?: unknown;
    };

export type RemoteCleanerStatus = "up" | "down" | "unconfigured" | "invalid_loopback";

export type RemoteHealth = {
  ok: boolean;
  status: RemoteCleanerStatus;
  configured: boolean;
  detail: unknown;
};

function uint8ToBase64(bytes: Uint8Array): string {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return Buffer.from(buf).toString("base64");
}

function base64ToUint8(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

export function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";
}

export function resolveCleanerUrl(env: Env): { url: string | null; reason?: string } {
  const raw = env.CLEANER_URL?.trim();
  if (!raw) return { url: null };

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { url: null, reason: "invalid_cleaner_url" };
  }

  if (isLoopbackHostname(parsed.hostname) && env.ENVIRONMENT === "production") {
    return { url: null, reason: "loopback_unreachable_in_production" };
  }

  return { url: raw.replace(/\/$/, "") };
}

export function hasContainerBinding(env: Env): boolean {
  return Boolean(env.CLEANER);
}

export function hasRemoteCleaner(env: Env): boolean {
  if (hasContainerBinding(env)) return true;
  return Boolean(resolveCleanerUrl(env).url);
}

export async function callCleaner(
  env: Env,
  params: { bytes: Uint8Array; name: string; timeoutMs: number },
): Promise<CleanerResult> {
  const payload = JSON.stringify({
    file: uint8ToBase64(params.bytes),
    name: params.name,
    options: {},
  });

  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
  };
  const cleanerKey = env.WATERMARKS_SERVER_API_KEY?.trim();
  if (cleanerKey) {
    headers.authorization = `Bearer ${cleanerKey}`;
  }

  const init: RequestInit = {
    method: "POST",
    headers,
    body: payload,
    signal: AbortSignal.timeout(params.timeoutMs),
  };

  let res: Response;
  try {
    res = await dispatchCleaner(env, "/clean", init);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 503, error: `cleaner_unreachable: ${message}` };
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    return {
      ok: false,
      status: res.status,
      error: `cleaner_bad_json status=${res.status}`,
    };
  }

  if (!res.ok || body.ok === false) {
    const errText =
      typeof body.error === "string"
        ? body.error
        : typeof body.message === "string"
          ? body.message
          : `cleaner HTTP ${res.status}`;
    return { ok: false, status: res.status, error: errText, detail: body };
  }

  if (typeof body.cleaned !== "string") {
    return { ok: false, status: 502, error: "cleaner_missing_cleaned", detail: body };
  }

  return {
    ok: true,
    kind: typeof body.kind === "string" ? body.kind : "unknown",
    cleaned: base64ToUint8(body.cleaned),
    report: body.report ?? null,
  };
}

export async function cleanerHealth(env: Env, timeoutMs = 5000): Promise<RemoteHealth> {
  if (!hasContainerBinding(env)) {
    const resolved = resolveCleanerUrl(env);
    if (resolved.reason === "loopback_unreachable_in_production") {
      return {
        ok: false,
        status: "invalid_loopback",
        configured: true,
        detail: {
          error: "CLEANER_URL points at localhost; the Worker cannot reach your laptop",
        },
      };
    }
    if (resolved.reason === "invalid_cleaner_url") {
      return {
        ok: false,
        status: "down",
        configured: true,
        detail: { error: "CLEANER_URL is not a valid URL" },
      };
    }
    if (!resolved.url) {
      return {
        ok: false,
        status: "unconfigured",
        configured: false,
        detail: {
          error: "no remote cleaner (set CLEANER_URL or enable the CLEANER container binding)",
          layerA: "Worker Layer A still cleans .txt/.md/.html/.svg without a remote cleaner",
        },
      };
    }
  }

  try {
    const res = await dispatchCleaner(env, "/health", {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const detail = await res.json().catch(() => ({ status: res.status }));
    return {
      ok: res.ok,
      status: res.ok ? "up" : "down",
      configured: true,
      detail,
    };
  } catch (err) {
    return {
      ok: false,
      status: "down",
      configured: true,
      detail: { error: err instanceof Error ? err.message : String(err) },
    };
  }
}

async function dispatchCleaner(env: Env, path: string, init: RequestInit): Promise<Response> {
  const ns = env.CLEANER;
  if (ns) {
    // Low-level DO stub. When Containers are enabled, export CleanerContainer
    // from index.ts so this fetch is proxied to port 8765.
    const stub = ns.get(ns.idFromName("shared"));
    const url = `http://cleaner${path.startsWith("/") ? path : `/${path}`}`;
    return stub.fetch(url, init);
  }

  const resolved = resolveCleanerUrl(env);
  if (resolved.url) {
    return fetch(`${resolved.url}${path.startsWith("/") ? path : `/${path}`}`, init);
  }

  if (resolved.reason === "loopback_unreachable_in_production") {
    throw new Error("CLEANER_URL is localhost; unreachable from production Workers");
  }

  throw new Error(
    "no cleaner configured (set CLEANER_URL or enable the CLEANER container binding)",
  );
}
