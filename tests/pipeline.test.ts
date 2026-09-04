import { env } from "cloudflare:test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { r2CleanedKey, r2ReportKey } from "../apps/worker/src/keys.ts";
import {
  ORIGIN,
  call,
  download,
  envWithCleaner,
  fakeBatch,
  getJob,
  recordingQueue,
  runQueue,
  testEnv,
  upload,
} from "./helpers.ts";

async function statusOf(workerEnv: Env, jobId: string): Promise<Record<string, unknown>> {
  return (await (await getJob(workerEnv, jobId)).json()) as Record<string, unknown>;
}

// Markdown: .txt is cleaned in-Worker by Layer A and never reaches the cleaner.
async function uploadedJobId(workerEnv: Env, name = "notes.md"): Promise<string> {
  const body = (await (await upload(workerEnv, { name })).json()) as Record<string, unknown>;
  return String(body.id);
}

describe("clean pipeline (waitUntil fallback)", () => {
  test("runs upload -> cleaner -> R2 -> D1 -> download end to end", async () => {
    const { env: workerEnv, cleaner } = envWithCleaner({
      kind: "ok",
      cleaned: "no zero width here",
      reportKind: "text",
    });

    const jobId = await uploadedJobId(workerEnv, "essay.md");

    // The Worker sent the uploaded bytes to the cleaner, base64-encoded.
    expect(cleaner.calls).toHaveLength(1);
    expect(cleaner.calls[0]!.path).toBe("/clean");
    expect(cleaner.calls[0]!.name).toBe("essay.md");
    expect(atob(cleaner.calls[0]!.fileBase64!)).toBe("hello");

    const status = await statusOf(workerEnv, jobId);
    expect(status.status).toBe("done");
    expect(status.cleanedSizeBytes).toBe("no zero width here".length);
    expect(status.download).toBe(`/api/jobs/${jobId}/download`);

    // Cleaned bytes and the report both land in R2.
    expect(await (await env.FOCAI_FILES.get(r2CleanedKey(jobId)))!.text()).toBe("no zero width here");
    const report = JSON.parse(await (await env.FOCAI_FILES.get(r2ReportKey(jobId)))!.text());
    expect(report.actions).toEqual(["strip_zero_width"]);

    const res = await download(workerEnv, jobId);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("no zero width here");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="essay.cleaned.md"');
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  test("keeps the honesty note in the stored report summary", async () => {
    const { env: workerEnv } = envWithCleaner({ kind: "ok" });
    const jobId = await uploadedJobId(workerEnv);
    const status = await statusOf(workerEnv, jobId);
    const summary = status.reportSummary as Record<string, unknown>;

    expect(summary.note).toMatch(/not certified removed/);
    expect(summary.note).toMatch(/Never: Anthropic watermark guaranteed removed/);
  });

  test("a 5xx cleaner leaves the job re-runnable instead of failed", async () => {
    const { env: workerEnv } = envWithCleaner({ kind: "http", status: 502 });
    const jobId = await uploadedJobId(workerEnv);
    const status = await statusOf(workerEnv, jobId);

    expect(status.status).toBe("queued");
    expect(status.error).toMatch(/cleaner/i);
  });

  test("an unreachable cleaner is treated as transient", async () => {
    const { env: workerEnv } = envWithCleaner({ kind: "unreachable" });
    const jobId = await uploadedJobId(workerEnv);
    const status = await statusOf(workerEnv, jobId);

    expect(status.status).toBe("queued");
    expect(status.error).toMatch(/cleaner_unreachable/);
  });

  test("a 4xx cleaner is permanent and marks the job errored", async () => {
    const { env: workerEnv } = envWithCleaner({
      kind: "http",
      status: 415,
      body: { ok: false, error: "unsupported_kind" },
    });
    const jobId = await uploadedJobId(workerEnv);
    const status = await statusOf(workerEnv, jobId);

    expect(status.status).toBe("error");
    expect(status.error).toBe("unsupported_kind");
  });

  test("POST /api/jobs re-drives a job that failed transiently", async () => {
    const { env: failing } = envWithCleaner({ kind: "http", status: 500 });
    const jobId = await uploadedJobId(failing);
    expect((await statusOf(failing, jobId)).status).toBe("queued");

    const { env: healthy } = envWithCleaner({ kind: "ok", cleaned: "second time lucky" });
    const retry = await call(
      new Request(`${ORIGIN}/api/jobs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId }),
      }),
      healthy,
    );

    expect(retry.status).toBe(202);
    expect((await statusOf(healthy, jobId)).status).toBe("done");
    expect(await (await download(healthy, jobId)).text()).toBe("second time lucky");
  });

  test("records an attempt per run so stuck jobs are visible", async () => {
    const { env: workerEnv } = envWithCleaner({ kind: "ok" });
    const jobId = await uploadedJobId(workerEnv);
    const row = await env.JOBS.prepare("SELECT attempts FROM jobs WHERE id = ?").bind(jobId).first();
    expect(row!.attempts).toBe(1);
  });
});

describe("cleaner over CLEANER_URL", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("uses the HTTP fallback when no container binding is present", async () => {
    const seen: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === "string" ? input : String(input);
      seen.push(url);
      if (url.endsWith("/health")) return Response.json({ ok: true });
      const payload = JSON.parse(String(init?.body)) as { file: string };
      return Response.json({ ok: true, kind: "text", cleaned: payload.file, report: {} });
    });

    const workerEnv = testEnv({ CLEANER_URL: "https://cleaner.test/" });
    const jobId = await uploadedJobId(workerEnv);

    expect(seen).toContain("https://cleaner.test/clean");
    expect((await statusOf(workerEnv, jobId)).status).toBe("done");
    expect(await (await download(workerEnv, jobId)).text()).toBe("hello");
  });

  test("fails the job cleanly when no cleaner is configured at all", async () => {
    const workerEnv = testEnv();
    const jobId = await uploadedJobId(workerEnv);
    const status = await statusOf(workerEnv, jobId);

    expect(status.status).toBe("error");
    expect(status.error).toMatch(/no cleaner configured/);
  });
});

describe("queue producer", () => {
  test("hands the job to the queue and does not clean inline", async () => {
    const { queue, sent } = recordingQueue();
    const { env: workerEnv, cleaner } = envWithCleaner({ kind: "ok" }, { CLEAN_QUEUE: queue });

    const jobId = await uploadedJobId(workerEnv);

    expect(sent).toEqual([{ jobId }]);
    expect(cleaner.calls).toHaveLength(0);
    expect((await statusOf(workerEnv, jobId)).status).toBe("queued");
  });

  test("health reports the queue transport once the binding exists", async () => {
    const { queue } = recordingQueue();
    const { env: workerEnv } = envWithCleaner({ kind: "ok" }, { CLEAN_QUEUE: queue });
    const body = (await (await call(new Request(`${ORIGIN}/api/health`), workerEnv)).json()) as Record<
      string,
      unknown
    >;

    expect(body.queue).toBe("queue");
  });
});

describe("queue consumer", () => {
  test("acks a message it cleaned successfully", async () => {
    const { queue } = recordingQueue();
    const { env: workerEnv } = envWithCleaner({ kind: "ok", cleaned: "via queue" }, { CLEAN_QUEUE: queue });
    const jobId = await uploadedJobId(workerEnv);

    const { batch, acked, retried } = fakeBatch([{ jobId }]);
    await runQueue(workerEnv, batch);

    expect(acked).toEqual(["msg-0"]);
    expect(retried).toEqual([]);
    expect((await statusOf(workerEnv, jobId)).status).toBe("done");
    expect(await (await download(workerEnv, jobId)).text()).toBe("via queue");
  });

  test("retries a transient cleaner failure so Queues can redeliver", async () => {
    const { queue } = recordingQueue();
    const { env: workerEnv } = envWithCleaner({ kind: "http", status: 503 }, { CLEAN_QUEUE: queue });
    const jobId = await uploadedJobId(workerEnv);

    const { batch, acked, retried } = fakeBatch([{ jobId }]);
    await runQueue(workerEnv, batch);

    expect(retried).toEqual(["msg-0"]);
    expect(acked).toEqual([]);
    expect((await statusOf(workerEnv, jobId)).status).toBe("queued");
  });

  test("acks a permanent failure instead of looping forever", async () => {
    const { queue } = recordingQueue();
    const { env: workerEnv } = envWithCleaner({ kind: "http", status: 415 }, { CLEAN_QUEUE: queue });
    const jobId = await uploadedJobId(workerEnv);

    const { batch, acked, retried } = fakeBatch([{ jobId }]);
    await runQueue(workerEnv, batch);

    expect(acked).toEqual(["msg-0"]);
    expect(retried).toEqual([]);
    expect((await statusOf(workerEnv, jobId)).status).toBe("error");
  });

  test("drops a poison message rather than redelivering it forever", async () => {
    const { env: workerEnv } = envWithCleaner({ kind: "ok" });
    const { batch, acked, retried } = fakeBatch([{ jobId: "../etc/passwd" }, {}, null]);
    await runQueue(workerEnv, batch);

    expect(acked).toEqual(["msg-0", "msg-1", "msg-2"]);
    expect(retried).toEqual([]);
  });

  test("processes every message in a batch independently", async () => {
    const { queue } = recordingQueue();
    const { env: workerEnv } = envWithCleaner({ kind: "ok" }, { CLEAN_QUEUE: queue });
    const first = await uploadedJobId(workerEnv, "a.txt");
    const second = await uploadedJobId(workerEnv, "b.txt");

    const { batch, acked } = fakeBatch([{ jobId: first }, { jobId: second }]);
    await runQueue(workerEnv, batch);

    expect(acked).toEqual(["msg-0", "msg-1"]);
    expect((await statusOf(workerEnv, first)).status).toBe("done");
    expect((await statusOf(workerEnv, second)).status).toBe("done");
  });

  test("does not run a job twice when it is already claimed", async () => {
    const { queue } = recordingQueue();
    const { env: workerEnv, cleaner } = envWithCleaner({ kind: "ok" }, { CLEAN_QUEUE: queue });
    const jobId = await uploadedJobId(workerEnv);

    const firstRun = fakeBatch([{ jobId }]);
    await runQueue(workerEnv, firstRun.batch);
    expect(cleaner.calls).toHaveLength(1);

    // A duplicate delivery of an already-finished job must not re-clean it.
    const duplicate = fakeBatch([{ jobId }]);
    await runQueue(workerEnv, duplicate.batch);

    expect(duplicate.acked).toEqual(["msg-0"]);
    expect(cleaner.calls).toHaveLength(1);
  });
});
