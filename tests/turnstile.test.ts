import { afterEach, describe, expect, test, vi } from "vitest";
import { TURNSTILE_ACTION } from "../apps/worker/src/turnstile.ts";
import { ORIGIN, call, envWithCleaner, testEnv, upload } from "./helpers.ts";

const HOSTNAME = "focairemover.carluve.workers.dev";
const SECRET = "0x-test-secret";

/** Stub siteverify. Returns the calls it saw so the payload can be asserted. */
function stubSiteverify(reply: unknown, options: { status?: number; throws?: boolean } = {}) {
  const calls: { url: string; body: Record<string, string> }[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String(input);
    const body = Object.fromEntries(new URLSearchParams(String(init?.body ?? "")));
    calls.push({ url, body });
    if (options.throws) throw new Error("siteverify unreachable");
    return Response.json(reply, { status: options.status ?? 200 });
  });
  return calls;
}

function turnstileEnv(overrides: Record<string, unknown> = {}) {
  return {
    TURNSTILE_SECRET: SECRET,
    TURNSTILE_HOSTNAMES: HOSTNAME,
    ...overrides,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("Turnstile is a no-op until it is configured", () => {
  test("uploads succeed with no secret and no token", async () => {
    const { env: workerEnv } = envWithCleaner({ kind: "ok" });
    expect((await upload(workerEnv)).status).toBe(202);
  });

  test("health reports it as off", async () => {
    const body = (await (await call(new Request(`${ORIGIN}/api/health`), testEnv())).json()) as Record<
      string,
      unknown
    >;
    expect(body.turnstile).toBe("off");
    expect(body.turnstileSitekey).toBeNull();
  });

  test("health publishes the sitekey once it is on, but never the secret", async () => {
    const workerEnv = testEnv(turnstileEnv({ TURNSTILE_SITEKEY: "0x4AAA-public" }));
    const raw = await (await call(new Request(`${ORIGIN}/api/health`), workerEnv)).text();
    const body = JSON.parse(raw) as Record<string, unknown>;

    expect(body.turnstile).toBe("on");
    expect(body.turnstileSitekey).toBe("0x4AAA-public");
    expect(raw).not.toContain(SECRET);
  });
});

describe("Turnstile verification once configured", () => {
  test("accepts a valid token and sends the canonical siteverify payload", async () => {
    const calls = stubSiteverify({ success: true, action: TURNSTILE_ACTION, hostname: HOSTNAME });
    const workerEnv = testEnv(turnstileEnv());

    const res = await upload(workerEnv, { turnstileToken: "good-token", ip: "203.0.113.9" });

    expect(res.status).toBe(202);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(calls[0]!.body.secret).toBe(SECRET);
    expect(calls[0]!.body.response).toBe("good-token");
    expect(calls[0]!.body.remoteip).toBe("203.0.113.9");
  });

  test("rejects a request with no token, without calling siteverify", async () => {
    const calls = stubSiteverify({ success: true, action: TURNSTILE_ACTION, hostname: HOSTNAME });
    const res = await upload(testEnv(turnstileEnv()));

    expect(res.status).toBe(403);
    expect(((await res.json()) as Record<string, unknown>).error).toBe("missing_turnstile_token");
    expect(calls).toHaveLength(0);
  });

  test("rejects a token siteverify says is bad", async () => {
    stubSiteverify({ success: false, "error-codes": ["invalid-input-response"] });
    const res = await upload(testEnv(turnstileEnv()), { turnstileToken: "bad" });

    expect(res.status).toBe(403);
    expect(((await res.json()) as Record<string, unknown>).error).toBe("turnstile_failed");
  });

  test("rejects a token minted for another action", async () => {
    stubSiteverify({ success: true, action: "some-other-form", hostname: HOSTNAME });
    const res = await upload(testEnv(turnstileEnv()), { turnstileToken: "elsewhere" });

    expect(((await res.json()) as Record<string, unknown>).error).toBe("turnstile_wrong_action");
  });

  test("rejects a token minted on another hostname", async () => {
    stubSiteverify({ success: true, action: TURNSTILE_ACTION, hostname: "evil.example" });
    const res = await upload(testEnv(turnstileEnv()), { turnstileToken: "elsewhere" });

    expect(((await res.json()) as Record<string, unknown>).error).toBe("turnstile_wrong_hostname");
  });

  test("fails CLOSED when siteverify is unreachable", async () => {
    stubSiteverify({}, { throws: true });
    const res = await upload(testEnv(turnstileEnv()), { turnstileToken: "good" });

    expect(res.status).toBe(403);
    expect(((await res.json()) as Record<string, unknown>).error).toBe("turnstile_unavailable");
  });

  test("fails CLOSED when siteverify returns a 5xx", async () => {
    stubSiteverify({ success: true }, { status: 502 });
    const res = await upload(testEnv(turnstileEnv()), { turnstileToken: "good" });

    expect(res.status).toBe(403);
    expect(((await res.json()) as Record<string, unknown>).error).toBe("turnstile_unavailable");
  });

  test("refuses to run with a secret but no hostname allowlist", async () => {
    stubSiteverify({ success: true, action: TURNSTILE_ACTION, hostname: HOSTNAME });
    const res = await upload(testEnv(turnstileEnv({ TURNSTILE_HOSTNAMES: "" })));

    expect(res.status).toBe(503);
    expect(((await res.json()) as Record<string, unknown>).error).toBe("server_misconfigured");
  });

  test("gates the retry endpoint too", async () => {
    stubSiteverify({ success: false, "error-codes": ["timeout-or-duplicate"] });
    const res = await call(
      new Request(`${ORIGIN}/api/jobs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jobId: "11111111-1111-4111-8111-111111111111",
          "cf-turnstile-response": "replayed",
        }),
      }),
      testEnv(turnstileEnv()),
    );

    expect(res.status).toBe(403);
    expect(((await res.json()) as Record<string, unknown>).error).toBe("turnstile_failed");
  });
});
