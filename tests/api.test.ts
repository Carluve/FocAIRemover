import { env } from "cloudflare:test";
import { describe, expect, test } from "vitest";
import { r2OriginalKey } from "../apps/worker/src/keys.ts";
import {
  ORIGIN,
  call,
  denyAllLimiter,
  download,
  envWithCleaner,
  getJob,
  testEnv,
  upload,
} from "./helpers.ts";

const UNREACHABLE = { kind: "unreachable" } as const;

describe("health", () => {
  test("reports the account, the auth mode and the job transport", async () => {
    const { env: workerEnv } = envWithCleaner({ kind: "ok" });
    const res = await call(new Request(`${ORIGIN}/api/health`), workerEnv);
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.account).toBe("39f8ea10b94ad38470fc3c20c260efdc");
    expect(body.r2).toBe("focairemover-files");
    expect(body.cleaner).toBe("up");
    expect(body.auth).toBe("public");
    expect(body.queue).toBe("waitUntil");
    expect(body.disclaimer).toMatch(/No guaranteed watermark removal/);
  });

  test("stays reachable without a bearer even when API_KEY is set", async () => {
    const workerEnv = testEnv({ API_KEY: "s3cret" });
    const res = await call(new Request(`${ORIGIN}/api/health`), workerEnv);
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.auth).toBe("bearer");
  });

  test("reports a down cleaner instead of failing", async () => {
    const { env: workerEnv } = envWithCleaner(UNREACHABLE);
    const res = await call(new Request(`${ORIGIN}/api/health`), workerEnv);
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.cleaner).toBe("down");
  });
});

describe("auth", () => {
  test("an unset API_KEY without the opt-in refuses to serve the API", async () => {
    const workerEnv = testEnv({ PUBLIC_UPLOADS: "false" });
    const res = await upload(workerEnv);
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(503);
    expect(body.error).toBe("server_misconfigured");
  });

  test("that same deploy still answers /api/health, reporting the fault", async () => {
    const workerEnv = testEnv({ PUBLIC_UPLOADS: "false" });
    const res = await call(new Request(`${ORIGIN}/api/health`), workerEnv);
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body.auth).toBe("misconfigured");
  });

  test("a set API_KEY rejects a missing or wrong bearer and accepts the right one", async () => {
    const { env: workerEnv } = envWithCleaner({ kind: "ok" }, { API_KEY: "s3cret" });

    expect((await upload(workerEnv)).status).toBe(401);
    expect((await upload(workerEnv, { bearer: "wrong" })).status).toBe(401);
    expect((await upload(workerEnv, { bearer: "s3cret" })).status).toBe(202);
  });

  test("the public opt-in does not override a configured API_KEY", async () => {
    const workerEnv = testEnv({ API_KEY: "s3cret", PUBLIC_UPLOADS: "true" });
    expect((await upload(workerEnv)).status).toBe(401);
  });
});

describe("upload validation", () => {
  test("rejects a non-multipart body", async () => {
    const res = await call(
      new Request(`${ORIGIN}/api/upload`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
      testEnv(),
    );
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(body.error).toBe("unsupported_media");
  });

  test("rejects a blocked extension", async () => {
    const res = await upload(testEnv(), { name: "payload.exe", type: "application/octet-stream" });
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(body.error).toBe("extension_blocked");
  });

  test("rejects an extension outside the allowlist", async () => {
    const res = await upload(testEnv(), { name: "archive.zip" });
    expect(((await res.json()) as Record<string, unknown>).error).toBe("extension_not_allowed");
  });

  test("rejects a file over MAX_UPLOAD_BYTES", async () => {
    const workerEnv = testEnv({ MAX_UPLOAD_BYTES: "16" });
    const res = await upload(workerEnv, { content: "x".repeat(64) });
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(413);
    expect(body.error).toBe("file_too_large");
  });

  test("rejects an empty file", async () => {
    const res = await upload(testEnv(), { content: "" });
    expect(((await res.json()) as Record<string, unknown>).error).toBe("empty_file");
  });
});

describe("upload storage", () => {
  test("stores the original in R2 under an opaque key and records the job in D1", async () => {
    const { env: workerEnv } = envWithCleaner(UNREACHABLE);
    const res = await upload(workerEnv, { name: "secret plan.txt", content: "zero​width" });
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(202);
    const jobId = String(body.id);
    expect(body.originalName).toBe("secret plan.txt");

    const stored = await env.FOCAI_FILES.get(r2OriginalKey(jobId));
    expect(stored).not.toBeNull();
    expect(await stored!.text()).toBe("zero​width");
    // The user filename must never become part of the object key.
    expect(r2OriginalKey(jobId)).not.toContain("secret");

    const row = await env.JOBS.prepare("SELECT * FROM jobs WHERE id = ?").bind(jobId).first();
    expect(row).not.toBeNull();
    // "zero" + U+200B (3 bytes in UTF-8) + "width"
    expect(row!.size_bytes).toBe(12);
    expect(row!.original_name).toBe("secret plan.txt");
  });
});

describe("idempotency", () => {
  test("replays the same job for the same caller and key", async () => {
    const { env: workerEnv } = envWithCleaner(UNREACHABLE);
    const first = (await (await upload(workerEnv, { ip: "203.0.113.7", idempotencyKey: "batch-1" })).json()) as Record<string, unknown>;
    const second = (await (await upload(workerEnv, { ip: "203.0.113.7", idempotencyKey: "batch-1" })).json()) as Record<string, unknown>;

    expect(second.id).toBe(first.id);
    expect(second.idempotentReplay).toBe(true);
  });

  test("never leaks another caller's job when two clients reuse one key", async () => {
    const { env: workerEnv } = envWithCleaner(UNREACHABLE);
    const mine = (await (await upload(workerEnv, {
      ip: "203.0.113.7",
      idempotencyKey: "1",
      name: "mine.txt",
    })).json()) as Record<string, unknown>;

    const theirs = (await (await upload(workerEnv, {
      ip: "198.51.100.4",
      idempotencyKey: "1",
      name: "theirs.txt",
    })).json()) as Record<string, unknown>;

    expect(theirs.id).not.toBe(mine.id);
    expect(theirs.idempotentReplay).toBeUndefined();
    expect(theirs.originalName).toBe("theirs.txt");
    expect(theirs.download).toBeNull();
  });
});

describe("job status and download", () => {
  test("rejects a job id that is not a UUID", async () => {
    const res = await getJob(testEnv(), "not-a-uuid");
    expect(res.status).toBe(400);
    expect(((await res.json()) as Record<string, unknown>).error).toBe("invalid_job_id");
  });

  test("a path-traversal job id never reaches the job route at all", async () => {
    // URL parsing collapses `..` before routing, so the request leaves /api
    // entirely rather than being matched against a job id.
    const res = await getJob(testEnv(), "../../etc/passwd");
    expect(res.status).toBe(404);
    expect(await res.text()).not.toMatch(/download|jobId/);
  });

  test("404s an unknown job", async () => {
    const res = await getJob(testEnv(), "11111111-1111-4111-8111-111111111111");
    expect(res.status).toBe(404);
  });

  test("refuses to download a job that is not done", async () => {
    const { env: workerEnv } = envWithCleaner(UNREACHABLE);
    const job = (await (await upload(workerEnv)).json()) as Record<string, unknown>;
    const res = await download(workerEnv, String(job.id));
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(409);
    expect(body.error).toBe("not_ready");
  });

  test("404s an unknown API route", async () => {
    const res = await call(new Request(`${ORIGIN}/api/nope`), testEnv());
    expect(res.status).toBe(404);
  });
});

describe("rate limiting", () => {
  test("returns 429 with Retry-After when the limiter denies the request", async () => {
    const workerEnv = testEnv({ RATE_LIMITER: denyAllLimiter() });
    const res = await upload(workerEnv);
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(429);
    expect(body.error).toBe("rate_limited");
    expect(res.headers.get("retry-after")).toBe("60");
  });

  test("does not throttle /api/health", async () => {
    const workerEnv = testEnv({ RATE_LIMITER: denyAllLimiter() });
    const res = await call(new Request(`${ORIGIN}/api/health`), workerEnv);
    expect(res.status).toBe(200);
  });
});

describe("CORS", () => {
  test("never echoes a wildcard and denies an unknown origin", async () => {
    const res = await call(
      new Request(`${ORIGIN}/api/upload`, {
        method: "OPTIONS",
        headers: { Origin: "https://evil.example" },
      }),
      testEnv(),
    );

    expect(res.status).toBe(403);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("echoes the same origin on a preflight", async () => {
    const res = await call(
      new Request(`${ORIGIN}/api/upload`, { method: "OPTIONS", headers: { Origin: ORIGIN } }),
      testEnv(),
    );

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(res.headers.get("vary")).toBe("Origin");
  });
});
