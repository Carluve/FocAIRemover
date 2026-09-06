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
  clientError,
  clientIp,
  json,
  logEvent,
  optionsResponse,
  requireBearer,
  withCors,
} from "./http";
import webAppJs from "./static/app.js.txt";
import { claimJob, getJob, getJobByIdempotency, insertJob, publicJob } from "./jobs";
import { JOB_ID_RE, r2CleanedKey, r2MetaKey, r2OriginalKey, r2ReportKey } from "./keys";
import { processJob } from "./process";
import { ValidationError, assertAllowedFile, parseMaxBytes, sanitizeDownloadName } from "./validate";

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

    // Serve UI JS from this Worker version so API deploys (no Wrangler
    // token) cannot leave a stale apps/web/app.js asset in front.
    if (url.pathname === "/app.js") {
      return new Response(webAppJs, {
        headers: {
          "content-type": "application/javascript; charset=utf-8",
          "cache-control": "no-cache",
        },
      });
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

// When enabling Cloudflare Containers, also export:
// export { CleanerContainer } from "./container";

async function handleApi(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  url: URL,
): Promise<Response> {
  const authErr = requireBearer(request, env.API_KEY);
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

    const jobMatch = /^\/api\/jobs\/([^/]+)(?:\/(download|report))?$/.exec(url.pathname);
    if (jobMatch) {
      const jobId = decodeURIComponent(jobMatch[1] ?? "");
      if (jobMatch[2] === "download" && request.method === "GET") {
        return await download(env, jobId);
      }
      if (jobMatch[2] === "report" && request.method === "GET") {
        return await jobReport(env, jobId);
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
      return json({ ok: false, error: "rate_limited", message: "too many requests" }, 429);
    }
  }
  return next();
}

async function health(env: Env): Promise<Response> {
  const remote = await cleanerHealth(env);
  const containersReady = remote.status === "up";
  return json({
    ok: true,
    service: "focairemover",
    r2: "focairemover-files",
    layerA: "up",
    cleaner: remote.status,
    remoteCleaner: remote.status,
    canClean: {
      text: true,
      // Word is cleaned in the Worker (OOXML is a ZIP of XML), no cleaner needed.
      docx: true,
      containers: containersReady,
    },
    enableStep: containersReady
      ? undefined
      : "Remote cleaner: set secret CLEANER_URL to a reachable watermarks-remover, or uncomment containers in wrangler.jsonc and `npm run deploy` with Docker.",
    cleanerDetail: remote.detail,
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

  const idempotencyKey = request.headers.get("idempotency-key")?.trim() || null;
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

  await env.FOCAI_FILES.put(r2OriginalKey(jobId), bytes, {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
    customMetadata: { jobId, originalName: filename, extension },
  });
  await env.FOCAI_FILES.put(r2MetaKey(jobId), JSON.stringify(meta), {
    httpMetadata: { contentType: "application/json" },
  });

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
  ctx.waitUntil(kickOff(env, jobId));
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

  ctx.waitUntil(kickOff(env, jobId));
  return json({ ...publicJob(row), status: row.status === "processing" ? "processing" : "queued" }, 202);
}

async function kickOff(env: Env, jobId: string): Promise<void> {
  const claimed = await claimJob(env.JOBS, jobId);
  if (!claimed) {
    logEvent({ msg: "job_not_claimed", jobId });
    return;
  }
  await processJob(env, jobId);
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

async function jobReport(env: Env, jobId: string): Promise<Response> {
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
  const object = await env.FOCAI_FILES.get(r2ReportKey(jobId));
  if (!object) {
    return json({ ok: true, report: row.report_summary ? safeJson(row.report_summary) : null });
  }
  const headers = new Headers();
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "private, no-store");
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { status: 200, headers });
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
