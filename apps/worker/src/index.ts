/**
 * FocAIRemover Worker — R2-backed upload / job / download API.
 *
 * Account: carluve @enterprise  39f8ea10b94ad38470fc3c20c260efdc
 * R2: focairemover-files (binding FOCAI_FILES)
 * D1: focairemover-jobs (binding JOBS)
 *
 * Every uploaded file is stored in R2 before cleaning. Cleaned output is
 * also stored in R2. Browser-only cleaning is not the primary path.
 */

import { cleanerHealth } from "./cleaner";
import {
  allowCorsOrigin,
  callerFingerprint,
  clientError,
  clientIp,
  json,
  logEvent,
  optionsResponse,
  requireBearer,
  withCors,
} from "./http";
import { claimJob, getJob, getJobByIdempotency, insertJob, publicJob } from "./jobs";
import { JOB_ID_RE, r2CleanedKey, r2MetaKey, r2OriginalKey } from "./keys";
import { processJob } from "./process";
import { ValidationError, assertAllowedFile, parseMaxBytes, sanitizeDownloadName } from "./validate";

/** Queue message body. Only the id travels — bytes stay in R2. */
export type CleanMessage = { jobId: string };

/**
 * Anonymous API access must be opted into explicitly; never the silent default.
 * String() because `wrangler types` types this var as a string *literal*, and a
 * literal comparison stops compiling the moment the value is flipped.
 */
function allowsAnonymous(env: Env): boolean {
  return String(env.PUBLIC_UPLOADS) === "true";
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = allowCorsOrigin(request, env.ALLOWED_ORIGIN);

    if (request.method === "OPTIONS" && url.pathname.startsWith("/api")) {
      if (request.headers.has("Origin") && !origin) {
        return json({ ok: false, error: "cors_denied" }, 403);
      }
      return optionsResponse(origin);
    }

    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      const response = await handleApi(request, env, ctx, url);
      return withCors(response, origin);
    }

    return env.ASSETS.fetch(request);
  },

  /**
   * Durable job processing. Queues owns retries and the dead-letter path, so a
   * job survives isolate eviction — unlike the ctx.waitUntil() fallback below.
   */
  async queue(batch: MessageBatch<CleanMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      const jobId = message.body?.jobId;
      if (!jobId || !JOB_ID_RE.test(jobId)) {
        logEvent({ msg: "queue_bad_message", id: message.id });
        message.ack();
        continue;
      }
      try {
        const outcome = await runJob(env, jobId);
        if (outcome === "retry") message.retry();
        else message.ack();
      } catch (err) {
        logEvent({
          msg: "queue_unhandled",
          jobId,
          error: err instanceof Error ? err.message : String(err),
        });
        message.retry();
      }
    }
  },
} satisfies ExportedHandler<Env, CleanMessage>;

// When enabling Cloudflare Containers, also export:
// export { CleanerContainer } from "./container";

async function handleApi(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  url: URL,
): Promise<Response> {
  const authErr = requireBearer(request, env.API_KEY, { allowAnonymous: allowsAnonymous(env) });
  if (authErr && url.pathname !== "/api/health") {
    return authErr;
  }

  try {
    if (url.pathname === "/api/health" && request.method === "GET") {
      return await health(env);
    }
    if (url.pathname === "/api/upload" && request.method === "POST") {
      return await rateLimited(request, env, () => upload(request, env, ctx));
    }
    if (url.pathname === "/api/jobs" && request.method === "POST") {
      return await rateLimited(request, env, () => startJob(request, env, ctx));
    }
    if (url.pathname === "/api/clean" && request.method === "POST") {
      return await rateLimited(request, env, () => startJob(request, env, ctx));
    }

    const jobMatch = /^\/api\/jobs\/([^/]+)(?:\/(download))?$/.exec(url.pathname);
    if (jobMatch) {
      const jobId = decodeURIComponent(jobMatch[1] ?? "");
      if (jobMatch[2] === "download" && request.method === "GET") {
        return await download(env, jobId);
      }
      if (request.method === "GET") {
        return await jobStatus(env, jobId);
      }
    }

    return clientError("not_found", "unknown API route", 404);
  } catch (err) {
    if (err instanceof ValidationError) {
      return clientError(err.code, err.message, err.status);
    }
    logEvent({ msg: "unhandled", error: err instanceof Error ? err.message : String(err) });
    return clientError("internal_error", "internal error", 500);
  }
}

async function rateLimited(
  request: Request,
  env: Env,
  next: () => Promise<Response>,
): Promise<Response> {
  const limiter = env.RATE_LIMITER;
  if (limiter) {
    const { success } = await limiter.limit({ key: `ip:${clientIp(request)}` });
    if (!success) {
      return json({ ok: false, error: "rate_limited", message: "too many requests" }, 429, {
        "retry-after": "60",
      });
    }
  }
  return next();
}

async function health(env: Env): Promise<Response> {
  const cleaner = await cleanerHealth(env);
  return json({
    ok: true,
    service: "focairemover",
    account: "39f8ea10b94ad38470fc3c20c260efdc",
    r2: "focairemover-files",
    cleaner: cleaner.ok ? "up" : "down",
    cleanerDetail: cleaner.detail,
    // Make the security posture readable from outside instead of guessable.
    auth: env.API_KEY?.trim() ? "bearer" : allowsAnonymous(env) ? "public" : "misconfigured",
    queue: env.CLEAN_QUEUE ? "queue" : "waitUntil",
    disclaimer:
      "Research/experimental. Files in R2 may be kept. No guaranteed watermark removal. AS IS.",
  });
}

async function upload(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const maxBytes = parseMaxBytes(env.MAX_UPLOAD_BYTES);
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > maxBytes + 1024 * 1024) {
    return clientError("file_too_large", `file exceeds max size of ${maxBytes} bytes`, 413);
  }

  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return clientError("unsupported_media", "POST multipart/form-data with field `file`");
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return clientError("missing_file", "multipart field `file` is required");
  }

  const filename = file.name || "upload.bin";
  const { extension } = assertAllowedFile(filename, file.type || null, file.size, maxBytes);

  // Scope the idempotency key to the caller. A bare key is attacker-chosen, so
  // an unscoped lookup would hand a replay of someone else's job — original
  // filename and download URL included — to anyone guessing a common value.
  const rawIdempotencyKey = request.headers.get("idempotency-key")?.trim() || null;
  const idempotencyKey = rawIdempotencyKey
    ? `${await callerFingerprint(request, env.API_KEY)}:${rawIdempotencyKey}`
    : null;
  if (idempotencyKey) {
    const existing = await getJobByIdempotency(env.JOBS, idempotencyKey);
    if (existing) {
      return json({ ...publicJob(existing), idempotentReplay: true }, 200);
    }
  }

  const jobId = crypto.randomUUID();
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > maxBytes) {
    return clientError("file_too_large", `file exceeds max size of ${maxBytes} bytes`, 413);
  }

  const meta = {
    jobId,
    originalName: filename,
    contentType: file.type || null,
    extension,
    sizeBytes: bytes.byteLength,
    storedAt: Date.now(),
  };

  await Promise.all([
    env.FOCAI_FILES.put(r2OriginalKey(jobId), bytes, {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
      customMetadata: { jobId, originalName: filename, extension },
    }),
    env.FOCAI_FILES.put(r2MetaKey(jobId), JSON.stringify(meta), {
      httpMetadata: { contentType: "application/json" },
    }),
  ]);

  try {
    await insertJob(env.JOBS, {
      id: jobId,
      original_name: filename,
      content_type: file.type || null,
      extension,
      size_bytes: bytes.byteLength,
      idempotency_key: idempotencyKey,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (idempotencyKey && /UNIQUE/i.test(message)) {
      const existing = await getJobByIdempotency(env.JOBS, idempotencyKey);
      if (existing) return json({ ...publicJob(existing), idempotentReplay: true }, 200);
    }
    throw err;
  }

  logEvent({ msg: "upload_stored", jobId, size: bytes.byteLength, extension });
  await enqueue(env, ctx, jobId);
  const row = await getJob(env.JOBS, jobId);
  return json(row ? publicJob(row) : { ok: true, id: jobId, status: "queued" }, 202);
}

async function startJob(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return clientError("invalid_json", "JSON body required");
  }
  const jobId = String(body.jobId ?? body.job_id ?? body.id ?? "");
  if (!JOB_ID_RE.test(jobId)) {
    return clientError("invalid_job_id", "jobId must be a UUID");
  }
  const row = await getJob(env.JOBS, jobId);
  if (!row) return clientError("not_found", "job not found", 404);
  if (row.status === "done") return json(publicJob(row), 200);

  await enqueue(env, ctx, jobId);
  return json({ ...publicJob(row), status: row.status === "processing" ? "processing" : "queued" }, 202);
}

/**
 * Hand the job to Queues when the binding exists. The ctx.waitUntil() path is
 * only a local/unbound fallback: it dies with the isolate and leaves the job
 * stuck in `processing` until STALE_PROCESSING_MS lets someone re-claim it.
 */
async function enqueue(env: Env, ctx: ExecutionContext, jobId: string): Promise<void> {
  if (env.CLEAN_QUEUE) {
    await env.CLEAN_QUEUE.send({ jobId });
    return;
  }
  ctx.waitUntil(runJob(env, jobId));
}

async function runJob(env: Env, jobId: string): Promise<"done" | "error" | "retry"> {
  const claimed = await claimJob(env.JOBS, jobId);
  if (!claimed) {
    // Another consumer holds it. Ack rather than pile on a duplicate run.
    logEvent({ msg: "job_not_claimed", jobId });
    return "done";
  }
  return processJob(env, jobId);
}

async function jobStatus(env: Env, jobId: string): Promise<Response> {
  if (!JOB_ID_RE.test(jobId)) {
    return clientError("invalid_job_id", "job id must be a UUID");
  }
  const row = await getJob(env.JOBS, jobId);
  if (!row) return clientError("not_found", "job not found", 404);
  return json(publicJob(row), 200);
}

async function download(env: Env, jobId: string): Promise<Response> {
  if (!JOB_ID_RE.test(jobId)) {
    return clientError("invalid_job_id", "job id must be a UUID");
  }
  const row = await getJob(env.JOBS, jobId);
  if (!row) return clientError("not_found", "job not found", 404);
  if (row.status !== "done") {
    return json(
      { ok: false, error: "not_ready", message: `job status is ${row.status}`, status: row.status },
      409,
    );
  }
  const object = await env.FOCAI_FILES.get(r2CleanedKey(jobId));
  if (!object) {
    return clientError("missing_object", "cleaned object missing from R2", 404);
  }
  const filename = sanitizeDownloadName(row.original_name, row.extension);
  const headers = new Headers();
  headers.set("content-type", object.httpMetadata?.contentType || row.content_type || "application/octet-stream");
  headers.set("content-disposition", `attachment; filename="${filename}"`);
  headers.set("cache-control", "private, no-store");
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { status: 200, headers });
}
