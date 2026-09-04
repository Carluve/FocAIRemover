import assert from "node:assert/strict";
import test from "node:test";
import {
  allowCorsOrigin,
  callerFingerprint,
  requireBearer,
  timingSafeEqualString,
  withCors,
} from "../apps/worker/src/http.ts";

test("CORS never returns wildcard", () => {
  const req = new Request("https://focairemover.example/api/health", {
    headers: { Origin: "https://evil.example" },
  });
  const origin = allowCorsOrigin(req, "https://focairemover.carluve.workers.dev");
  assert.equal(origin, null);
  const res = withCors(new Response("ok"), origin);
  assert.equal(res.headers.get("access-control-allow-origin"), null);
  assert.notEqual(res.headers.get("access-control-allow-origin"), "*");
});

test("CORS allows same-origin and explicit ALLOWED_ORIGIN", () => {
  const same = new Request("https://focairemover.carluve.workers.dev/api/health", {
    headers: { Origin: "https://focairemover.carluve.workers.dev" },
  });
  assert.equal(
    allowCorsOrigin(same, "https://other.example"),
    "https://focairemover.carluve.workers.dev",
  );

  const allowed = new Request("https://api.example/api/health", {
    headers: { Origin: "https://focairemover.carluve.workers.dev" },
  });
  assert.equal(
    allowCorsOrigin(allowed, "https://focairemover.carluve.workers.dev"),
    "https://focairemover.carluve.workers.dev",
  );
});

test("bearer compare is length-safe and rejects mismatches", () => {
  assert.equal(timingSafeEqualString("secret", "secret"), true);
  assert.equal(timingSafeEqualString("secret", "Secret"), false);
  assert.equal(timingSafeEqualString("secret", "secre"), false);

  const noAuth = new Request("https://x/api/upload");
  const missing = requireBearer(noAuth, "token-value", { allowAnonymous: false });
  assert.equal(missing?.status, 401);
  const ok = requireBearer(
    new Request("https://x/api/upload", { headers: { authorization: "Bearer token-value" } }),
    "token-value",
    { allowAnonymous: false },
  );
  assert.equal(ok, null);
});

test("an unset API_KEY fails closed instead of opening the API", () => {
  const req = new Request("https://x/api/upload");
  const closed = requireBearer(req, undefined, { allowAnonymous: false });
  assert.equal(closed?.status, 503);
  // Anonymous access is only reachable as a deliberate opt-in.
  assert.equal(requireBearer(req, undefined, { allowAnonymous: true }), null);
});

test("a set API_KEY still wins over the anonymous opt-in", () => {
  const req = new Request("https://x/api/upload");
  const denied = requireBearer(req, "token-value", { allowAnonymous: true });
  assert.equal(denied?.status, 401);
});

test("idempotency fingerprints separate callers", async () => {
  const a = new Request("https://x/api/upload", { headers: { "cf-connecting-ip": "1.1.1.1" } });
  const b = new Request("https://x/api/upload", { headers: { "cf-connecting-ip": "2.2.2.2" } });
  const fpA = await callerFingerprint(a, undefined);
  const fpB = await callerFingerprint(b, undefined);

  assert.notEqual(fpA, fpB, "two clients must not share an idempotency scope");
  assert.equal(fpA, await callerFingerprint(a, undefined), "same caller must be stable");
  assert.match(fpA, /^[0-9a-f]{64}$/, "fingerprint must not leak the raw IP");
  assert.equal(fpA.includes("1.1.1.1"), false);
});
