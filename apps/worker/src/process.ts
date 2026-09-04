import { callCleaner } from "./cleaner";
import { finishJob, getJob } from "./jobs";
import { CLEANER_MAX_ATTEMPTS, r2CleanedKey, r2OriginalKey, r2ReportKey } from "./keys";
import { logEvent } from "./http";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseTimeout(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 20_000;
}

export async function processJob(env: Env, jobId: string): Promise<void> {
  const job = await getJob(env.JOBS, jobId);
  if (!job) {
    logEvent({ msg: "process_missing_job", jobId });
    return;
  }

  const original = await env.FOCAI_FILES.get(r2OriginalKey(jobId));
  if (!original) {
    await finishJob(env.JOBS, jobId, {
      status: "error",
      error: "original object missing from R2",
    });
    return;
  }

  const bytes = new Uint8Array(await original.arrayBuffer());
  const timeoutMs = parseTimeout(env.CLEANER_TIMEOUT_MS);
  let lastError = "cleaner_failed";

  for (let attempt = 1; attempt <= CLEANER_MAX_ATTEMPTS; attempt++) {
    logEvent({
      msg: "cleaner_attempt",
      jobId,
      attempt,
      size: bytes.byteLength,
      name: job.original_name,
    });
    const result = await callCleaner(env, {
      bytes,
      name: job.original_name,
      timeoutMs,
    });
    if (result.ok) {
      await env.FOCAI_FILES.put(r2CleanedKey(jobId), result.cleaned, {
        httpMetadata: {
          contentType: job.content_type || "application/octet-stream",
        },
        customMetadata: {
          jobId,
          kind: result.kind,
          originalName: job.original_name,
        },
      });
      const summary = summarizeReport(result.kind, result.report);
      await env.FOCAI_FILES.put(r2ReportKey(jobId), JSON.stringify(result.report ?? {}), {
        httpMetadata: { contentType: "application/json" },
      });
      await finishJob(env.JOBS, jobId, {
        status: "done",
        cleaned_size_bytes: result.cleaned.byteLength,
        report_summary: JSON.stringify(summary),
        error: null,
      });
      logEvent({ msg: "job_done", jobId, kind: result.kind, cleanedBytes: result.cleaned.byteLength });
      return;
    }

    lastError = sanitizeError(result.error);
    const retryable = result.status >= 500 || result.status === 0 || /unreachable|timeout/i.test(result.error);
    if (!retryable || attempt === CLEANER_MAX_ATTEMPTS) {
      break;
    }
    await sleep(250 * 2 ** (attempt - 1));
  }

  await finishJob(env.JOBS, jobId, { status: "error", error: lastError });
  logEvent({ msg: "job_error", jobId, error: lastError });
}

function summarizeReport(kind: string, report: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {
    kind,
    note: "Layer A and metadata stripping are verifiable. Statistical text watermarks are not certified removed. Never: Anthropic watermark guaranteed removed.",
  };
  if (report && typeof report === "object") {
    const r = report as Record<string, unknown>;
    if ("actions" in r) out.actions = r.actions;
    if ("suspicious" in r) out.suspicious = r.suspicious;
    if ("layer_b" in r) out.layer_b = r.layer_b;
    if ("still_has_c2pa" in r) out.still_has_c2pa = r.still_has_c2pa;
    if ("still_has_ai_metadata" in r) out.still_has_ai_metadata = r.still_has_ai_metadata;
  }
  return out;
}

function sanitizeError(raw: string): string {
  return raw.replace(/[\u0000-\u001f]/g, " ").slice(0, 500);
}
