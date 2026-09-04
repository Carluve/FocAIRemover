import { callCleaner, cleanerOptions } from "./cleaner";
import { finishJob, getJob } from "./jobs";
import { DEFAULT_CLEANER_TIMEOUT_MS, r2CleanedKey, r2OriginalKey, r2ReportKey } from "./keys";
import { logEvent } from "./http";
import { cleanText, type CleanTextOptions } from "./layer-a/clean-text";

/**
 * Extensions cleaned in the Worker instead of the container.
 *
 * Upstream routes only plain text to its `text` kind, where it makes a Layer B
 * LLM rewrite mandatory — so .txt could never be cleaned by the container
 * without sending the user's prose to a model. Layer A is verifiable and needs
 * no model, so the Worker runs it here. Everything else (.md and .html are
 * `container`, images are `image`) still goes to the cleaner, which does
 * metadata work the Worker cannot.
 */
const WORKER_LAYER_A_EXTENSIONS: ReadonlySet<string> = new Set(["txt"]);

/**
 * `retry` means a transient cleaner failure: the job goes back to `queued` so
 * the queue consumer (or the UI retry button) can re-drive it. Retries are the
 * queue's job, not an in-process backoff loop — a Worker that gets evicted
 * mid-sleep loses the job entirely.
 */
export type JobOutcome = "done" | "error" | "retry";

function parseTimeout(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_CLEANER_TIMEOUT_MS;
}

export function isRetryable(status: number, error: string): boolean {
  return status >= 500 || status === 0 || /unreachable|timeout/i.test(error);
}

export async function processJob(env: Env, jobId: string): Promise<JobOutcome> {
  const job = await getJob(env.JOBS, jobId);
  if (!job) {
    logEvent({ msg: "process_missing_job", jobId });
    return "error";
  }

  const original = await env.FOCAI_FILES.get(r2OriginalKey(jobId));
  if (!original) {
    await finishJob(env.JOBS, jobId, {
      status: "error",
      error: "original object missing from R2",
    });
    return "error";
  }

  const bytes = new Uint8Array(await original.arrayBuffer());

  if (WORKER_LAYER_A_EXTENSIONS.has(job.extension)) {
    return layerAOnly(env, jobId, job, bytes);
  }

  logEvent({ msg: "cleaner_attempt", jobId, size: bytes.byteLength, name: job.original_name });

  const result = await callCleaner(env, {
    bytes,
    name: job.original_name,
    timeoutMs: parseTimeout(env.CLEANER_TIMEOUT_MS),
  });

  if (result.ok) {
    const summary = summarizeReport(result.kind, result.report);
    await Promise.all([
      env.FOCAI_FILES.put(r2CleanedKey(jobId), result.cleaned, {
        httpMetadata: { contentType: job.content_type || "application/octet-stream" },
        customMetadata: { jobId, kind: result.kind, originalName: job.original_name },
      }),
      env.FOCAI_FILES.put(r2ReportKey(jobId), JSON.stringify(result.report ?? {}), {
        httpMetadata: { contentType: "application/json" },
      }),
    ]);
    await finishJob(env.JOBS, jobId, {
      status: "done",
      cleaned_size_bytes: result.cleaned.byteLength,
      report_summary: JSON.stringify(summary),
      error: null,
    });
    logEvent({ msg: "job_done", jobId, kind: result.kind, cleanedBytes: result.cleaned.byteLength });
    return "done";
  }

  const lastError = sanitizeError(result.error);
  const retry = !result.permanent && isRetryable(result.status, result.error);
  await finishJob(env.JOBS, jobId, { status: retry ? "queued" : "error", error: lastError });
  logEvent({ msg: retry ? "job_retry" : "job_error", jobId, error: lastError });
  return retry ? "retry" : "error";
}

/** Upstream option names (snake_case) mapped onto the port's options. */
function layerAOptions(env: Env): CleanTextOptions {
  const raw = cleanerOptions(env);
  const flag = (key: string): boolean | undefined =>
    typeof raw[key] === "boolean" ? (raw[key] as boolean) : undefined;
  return {
    nfkc: flag("nfkc"),
    aggressiveHomoglyphs: flag("aggressive_homoglyphs"),
    normalizeSpaces: flag("normalize_spaces"),
    stripEmojiGlue: flag("strip_emoji_glue"),
    stripBidi: flag("strip_bidi"),
  };
}

/**
 * Clean plain text in the Worker. No container, no model, no network — which is
 * why this path is the one the README can call verifiable.
 */
async function layerAOnly(
  env: Env,
  jobId: string,
  job: { content_type: string | null; original_name: string },
  bytes: Uint8Array,
): Promise<JobOutcome> {
  let text: string;
  try {
    // Strict: a replacement-character decode would silently corrupt the file.
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    await finishJob(env.JOBS, jobId, {
      status: "error",
      error: "not_utf8_text: plain text uploads must be valid UTF-8",
    });
    logEvent({ msg: "layer_a_not_utf8", jobId });
    return "error";
  }

  const { text: cleaned, stats } = cleanText(text, layerAOptions(env));
  const cleanedBytes = new TextEncoder().encode(cleaned);
  const report = {
    kind: "text",
    engine: "worker-layer-a",
    actions: [
      `layer A text: removed=${stats.removedCount} replaced=${stats.replacedCount}`,
      ...(stats.nfkcChanged ? ["NFKC normalised"] : []),
    ],
    changed: cleaned !== text,
    stats,
    // Stated in the artefact itself, not just the docs.
    layer_b: "not applied; statistical text watermarks are NOT addressed here",
  };

  await Promise.all([
    env.FOCAI_FILES.put(r2CleanedKey(jobId), cleanedBytes, {
      httpMetadata: { contentType: job.content_type || "text/plain; charset=utf-8" },
      customMetadata: { jobId, kind: "text", originalName: job.original_name },
    }),
    env.FOCAI_FILES.put(r2ReportKey(jobId), JSON.stringify(report), {
      httpMetadata: { contentType: "application/json" },
    }),
  ]);

  await finishJob(env.JOBS, jobId, {
    status: "done",
    cleaned_size_bytes: cleanedBytes.byteLength,
    report_summary: JSON.stringify(summarizeReport("text", report)),
    error: null,
  });
  logEvent({
    msg: "job_done",
    jobId,
    kind: "text",
    engine: "worker-layer-a",
    removed: stats.removedCount,
    replaced: stats.replacedCount,
  });
  return "done";
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
