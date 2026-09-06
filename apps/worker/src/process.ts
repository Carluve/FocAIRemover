import { callCleaner, hasRemoteCleaner } from "./cleaner";
import { logEvent } from "./http";
import { finishJob, getJob } from "./jobs";
import { CLEANER_MAX_ATTEMPTS, r2CleanedKey, r2OriginalKey, r2ReportKey } from "./keys";
import { cleanLayerA, decodeUtf8, encodeUtf8, isLayerATextExtension } from "./layerA";
import { cleanDocx, DOCX_CONTENT_TYPE, DocxError, isWorkerOoxmlExtension } from "./ooxml";
import { honestNote, summarizeReport } from "./reportSummary";

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

  if (isLayerATextExtension(job.extension)) {
    await processLayerA(env, jobId, job.original_name, bytes);
    return;
  }

  if (isWorkerOoxmlExtension(job.extension)) {
    await processDocx(env, jobId, job.original_name, bytes);
    return;
  }

  if (!hasRemoteCleaner(env)) {
    await finishJob(env.JOBS, jobId, {
      status: "error",
      error:
        "cleaner_unconfigured: PDF/imagen/AV need CLEANER_URL or Cloudflare Containers. Text (.txt/.md/.html/.svg) and Word (.docx) are cleaned in the Worker without a remote cleaner.",
    });
    logEvent({ msg: "job_error", jobId, error: "cleaner_unconfigured" });
    return;
  }

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
      await storeCleaned(env, jobId, result.cleaned, job.content_type, job.original_name, {
        kind: result.kind,
        backend: "remote-cleaner",
        report: result.report,
      });
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

async function processLayerA(
  env: Env,
  jobId: string,
  originalName: string,
  bytes: Uint8Array,
): Promise<void> {
  let text: string;
  try {
    text = decodeUtf8(bytes);
  } catch {
    await finishJob(env.JOBS, jobId, {
      status: "error",
      error: "invalid_utf8: Layer A expects UTF-8 text",
    });
    return;
  }

  const result = cleanLayerA(text);
  const cleaned = encodeUtf8(result.cleaned);
  const report = {
    kind: "text",
    layer: "A",
    backend: "worker-layer-a",
    removedCount: result.removedCount,
    removed: result.removed,
    note: honestNote(),
  };

  await storeCleaned(env, jobId, cleaned, "text/plain; charset=utf-8", originalName, {
    kind: "text",
    backend: "worker-layer-a",
    report,
  });
}

/**
 * Word in the Worker: Layer A over every XML part plus docProps metadata
 * stripping. No container, so this path works on a bare deploy.
 */
async function processDocx(
  env: Env,
  jobId: string,
  originalName: string,
  bytes: Uint8Array,
): Promise<void> {
  let result: Awaited<ReturnType<typeof cleanDocx>>;
  try {
    result = await cleanDocx(bytes);
  } catch (err) {
    const error =
      err instanceof DocxError
        ? err.message
        : `docx_failed: ${err instanceof Error ? err.message : String(err)}`;
    await finishJob(env.JOBS, jobId, { status: "error", error: sanitizeError(error) });
    logEvent({ msg: "job_error", jobId, error });
    return;
  }

  await storeCleaned(env, jobId, result.cleaned, DOCX_CONTENT_TYPE, originalName, {
    kind: "docx",
    backend: "worker-ooxml",
    report: { ...result.report, note: honestNote() },
  });
}

async function storeCleaned(
  env: Env,
  jobId: string,
  cleaned: Uint8Array,
  contentType: string | null,
  originalName: string,
  meta: { kind: string; backend: string; report: unknown },
): Promise<void> {
  await env.FOCAI_FILES.put(r2CleanedKey(jobId), cleaned, {
    httpMetadata: {
      contentType: contentType || "application/octet-stream",
    },
    customMetadata: {
      jobId,
      kind: meta.kind,
      backend: meta.backend,
      originalName,
    },
  });
  const summary = summarizeReport(meta.kind, meta.report);
  await env.FOCAI_FILES.put(r2ReportKey(jobId), JSON.stringify(meta.report ?? {}), {
    httpMetadata: { contentType: "application/json" },
  });
  await finishJob(env.JOBS, jobId, {
    status: "done",
    cleaned_size_bytes: cleaned.byteLength,
    report_summary: JSON.stringify(summary),
    error: null,
  });
  logEvent({
    msg: "job_done",
    jobId,
    kind: meta.kind,
    backend: meta.backend,
    cleanedBytes: cleaned.byteLength,
  });
}

function sanitizeError(raw: string): string {
  return raw.replace(/[\u0000-\u001f]/g, " ").slice(0, 500);
}
