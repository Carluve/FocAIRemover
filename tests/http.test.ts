import assert from "node:assert/strict";
import test from "node:test";
import { allowCorsOrigin, withCors } from "../apps/worker/src/http.ts";

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
