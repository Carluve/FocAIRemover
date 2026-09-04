/**
 * Cloudflare Turnstile verification.
 *
 * The bundled drag-drop UI cannot hold an API key, so `/api/upload` is served
 * anonymously (PUBLIC_UPLOADS). Turnstile is what keeps that from meaning
 * "anyone may spend this account's R2 and cleaner capacity from a script":
 * the per-IP rate limiter alone only slows one attacker down.
 *
 * Verification is a no-op while TURNSTILE_SECRET is unset, so local dev and the
 * test suite keep working. Once the secret exists it fails CLOSED: a network
 * error, a non-2xx, a non-JSON body, a wrong action or an unexpected hostname
 * all reject.
 *
 * https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */

import { clientIp, json, logEvent } from "./http";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const VERIFY_TIMEOUT_MS = 10_000;
/** Turnstile tokens are ~2KB at most; anything longer is not worth a round trip. */
const MAX_TOKEN_LENGTH = 2048;

/**
 * One widget, one surface, one action. The action check exists to stop a token
 * minted for some other site or surface being replayed here; splitting it per
 * endpoint would only mean rendering a second widget for the retry button.
 */
export const TURNSTILE_ACTION = "upload";
export type TurnstileAction = typeof TURNSTILE_ACTION;

export function turnstileEnabled(env: Env): boolean {
  return Boolean(env.TURNSTILE_SECRET?.trim());
}

function expectedHostnames(env: Env): Set<string> {
  return new Set(
    String(env.TURNSTILE_HOSTNAMES ?? "")
      .split(",")
      .map((hostname) => hostname.trim())
      .filter(Boolean),
  );
}

type SiteverifyResponse = {
  success?: boolean;
  action?: string;
  hostname?: string;
  "error-codes"?: string[];
};

/**
 * Returns null when the request may proceed, or the 403 to send back.
 * `token` is the `cf-turnstile-response` value from the client.
 */
export async function verifyTurnstile(
  request: Request,
  env: Env,
  token: unknown,
  action: TurnstileAction,
): Promise<Response | null> {
  const secret = env.TURNSTILE_SECRET?.trim();
  if (!secret) return null; // Not configured: no-op by design.

  const hostnames = expectedHostnames(env);
  if (hostnames.size === 0) {
    // A secret with no hostname allowlist would accept tokens minted for any
    // site sharing the widget. Refuse rather than verify weakly.
    logEvent({ msg: "turnstile_no_hostnames" });
    return json(
      {
        ok: false,
        error: "server_misconfigured",
        message: "TURNSTILE_SECRET is set but TURNSTILE_HOSTNAMES is empty",
      },
      503,
    );
  }

  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    return forbidden("missing_turnstile_token");
  }

  let result: SiteverifyResponse;
  try {
    const res = await fetch(SITEVERIFY, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      body: new URLSearchParams({
        secret,
        response: token,
        remoteip: clientIp(request),
      }),
    });
    if (!res.ok) throw new Error(`siteverify ${res.status}`);
    result = (await res.json()) as SiteverifyResponse;
  } catch (err) {
    // Fail closed: an unreachable siteverify must not become an open door.
    logEvent({
      msg: "turnstile_verify_failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return forbidden("turnstile_unavailable");
  }

  if (result.success !== true) {
    logEvent({ msg: "turnstile_rejected", codes: result["error-codes"] ?? [] });
    return forbidden("turnstile_failed");
  }
  if (result.action !== action) {
    logEvent({ msg: "turnstile_wrong_action", got: result.action, want: action });
    return forbidden("turnstile_wrong_action");
  }
  if (!result.hostname || !hostnames.has(result.hostname)) {
    logEvent({ msg: "turnstile_wrong_hostname", got: result.hostname });
    return forbidden("turnstile_wrong_hostname");
  }
  return null;
}

function forbidden(code: string): Response {
  return json(
    { ok: false, error: code, message: "bot verification failed; reload and try again" },
    403,
  );
}
