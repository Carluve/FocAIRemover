#!/usr/bin/env node
/**
 * End-to-end checks against a running Worker, over real HTTP.
 *
 * The Vitest suite drives the Worker in-process; this drives the deployed
 * shape: real routing, real multipart, real R2/D1, real static assets.
 *
 *   npx wrangler d1 migrations apply focairemover-jobs --local
 *   node scripts/fake-cleaner.mjs &          # or docker compose up
 *   echo 'CLEANER_URL=http://127.0.0.1:8765' > .dev.vars
 *   npx wrangler dev &
 *   npm run e2e
 *
 * Exits non-zero if any check fails.
 */
const BASE = process.env.E2E_BASE || "http://127.0.0.1:8787";
const ZW = "​";
const ORIGINAL = `Este texto${ZW} lleva marcas${ZW} invisibles${ZW}.`;

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function poll(id, tries = 40) {
  for (let i = 0; i < tries; i++) {
    const job = await (await fetch(`${BASE}/api/jobs/${id}`)).json();
    if (job.status === "done" || job.status === "error") return job;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("job never settled");
}

async function upload(name, content, headers = {}) {
  const form = new FormData();
  form.set("file", new File([content], name, { type: "text/plain" }), name);
  const res = await fetch(`${BASE}/api/upload`, { method: "POST", body: form, headers });
  return { res, body: await res.json() };
}

const health = await (await fetch(`${BASE}/api/health`)).json();
check("health ok", health.ok === true);
check("cleaner reachable", health.cleaner === "up", `cleaner=${health.cleaner}`);
if (health.cleaner !== "up") {
  console.error("\nStart a cleaner first (scripts/fake-cleaner.mjs or docker compose up).");
  process.exit(1);
}

// Full clean cycle. Markdown, not .txt: upstream watermarks-remover routes .txt
// to the `text` kind, where a Layer B rewrite is mandatory. Markdown is the
// `container` kind and cleans with Layer A alone, which is what this repo claims.
const { res: upRes, body: up } = await upload("ensayo.md", ORIGINAL);
check("upload accepted", upRes.status === 202, `status ${upRes.status}`);

const job = await poll(up.id);
check("job reached done", job.status === "done", `status=${job.status} error=${job.error}`);
check(
  "report keeps the honesty note",
  String(job.reportSummary?.note || "").includes("Never: Anthropic watermark guaranteed removed"),
);

const dl = await fetch(`${BASE}/api/jobs/${up.id}/download`);
const cleaned = await dl.text();
check("download returns 200", dl.status === 200, `status ${dl.status}`);
check(
  "download filename is sanitised",
  dl.headers.get("content-disposition") === 'attachment; filename="ensayo.cleaned.md"',
  dl.headers.get("content-disposition"),
);
check("download is not cacheable", dl.headers.get("cache-control") === "private, no-store");
check("invisible Unicode removed", !cleaned.includes(ZW));
check("visible text preserved", cleaned === ORIGINAL.replaceAll(ZW, ""), JSON.stringify(cleaned));

// Plain .txt is cleaned in the Worker by the Layer A port. Upstream would
// reject it (Layer B is mandatory for its `text` kind), so a success here also
// proves the request never went to the container.
const EMOJI = "listo ❤️‍🔥 y 👨‍👩‍👧";
const plain = await upload("ensayo.txt", `${ORIGINAL}\n${EMOJI}${ZW}`);
const plainJob = await poll(plain.body.id);
check("plain .txt cleaned by the Worker", plainJob.status === "done", `error=${plainJob.error}`);
if (plainJob.status === "done") {
  const out = await (await fetch(`${BASE}/api/jobs/${plain.body.id}/download`)).text();
  check("invisible Unicode gone from .txt", !out.includes(ZW));
  check("emoji sequences survived the .txt clean", out.endsWith(EMOJI), JSON.stringify(out.slice(-24)));
  check(
    "report says Layer B was not applied",
    String(plainJob.reportSummary?.layer_b || "").includes("not applied"),
  );
}

// Idempotency must be scoped per caller.
const mine = await upload("mio.txt", "aaa", { "idempotency-key": "1", "cf-connecting-ip": "203.0.113.7" });
const replay = await upload("mio.txt", "aaa", { "idempotency-key": "1", "cf-connecting-ip": "203.0.113.7" });
const theirs = await upload("suyo.txt", "bbb", { "idempotency-key": "1", "cf-connecting-ip": "198.51.100.4" });
check(
  "same caller + same key replays one job",
  replay.body.id === mine.body.id && replay.body.idempotentReplay === true,
);
check("another caller with the same key gets its own job", theirs.body.id !== mine.body.id);
check("no cross-caller filename leak", theirs.body.originalName === "suyo.txt");

// Validation and routing.
const blocked = await upload("virus.exe", "MZ");
check("blocked extension rejected", blocked.res.status === 400 && blocked.body.error === "extension_blocked");
check("unknown job 404s", (await fetch(`${BASE}/api/jobs/11111111-1111-4111-8111-111111111111`)).status === 404);
check("non-UUID job id rejected", (await fetch(`${BASE}/api/jobs/not-a-uuid`)).status === 400);

// CORS is never a wildcard.
const cors = await fetch(`${BASE}/api/upload`, {
  method: "OPTIONS",
  headers: { Origin: "https://evil.example" },
});
check("unknown origin preflight denied", cors.status === 403);
check("no wildcard CORS header", cors.headers.get("access-control-allow-origin") !== "*");

// The UI is still served next to the API.
check("UI served", (await fetch(`${BASE}/`)).status === 200);

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
