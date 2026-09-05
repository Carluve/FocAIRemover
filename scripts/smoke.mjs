#!/usr/bin/env node
/**
 * Smoke against a running `npx wrangler dev` (default http://127.0.0.1:8787).
 * Requires D1 migrations applied locally (`npm run migrate:local`).
 * Text (.txt) is cleaned by Worker Layer A without CLEANER_URL.
 * PDF/Office still error until CLEANER_URL or Containers are up.
 */
const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:8787";

async function main() {
  const health = await fetch(`${BASE}/api/health`);
  const healthJson = await health.json();
  if (!health.ok || healthJson.ok !== true) {
    throw new Error(`health failed: ${health.status} ${JSON.stringify(healthJson)}`);
  }

  const file = new File(["Hello\u200bWorld"], "sample.txt", { type: "text/plain" });
  const body = new FormData();
  body.set("file", file, "sample.txt");
  const up = await fetch(`${BASE}/api/upload`, { method: "POST", body });
  const upJson = await up.json();
  if (up.status !== 202 && up.status !== 200) {
    throw new Error(`upload failed: ${up.status} ${JSON.stringify(upJson)}`);
  }
  if (!upJson.id) throw new Error("upload missing job id");

  const st = await fetch(`${BASE}/api/jobs/${upJson.id}`);
  const stJson = await st.json();
  if (!st.ok) throw new Error(`job status failed: ${st.status} ${JSON.stringify(stJson)}`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        health: healthJson.service,
        jobId: upJson.id,
        status: stJson.status,
        note: "cleaned download requires the cleaner; R2 original should exist regardless",
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
