import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import worker, { type CleanMessage } from "../apps/worker/src/index.ts";

export const ORIGIN = "https://focairemover.carluve.workers.dev";

/**
 * `wrangler types` types vars as string *literals* ("true", "8388608"), so a
 * spread with overrides is not assignable to Env. The cast is confined here.
 */
export function testEnv(overrides: Record<string, unknown> = {}): Env {
  return {
    ...env,
    // Hermetic by default. A developer's .dev.vars is loaded into the test env
    // by wrangler, so without this a local CLEANER_URL would silently point the
    // suite at a real cleaner. Tests opt in to a cleaner explicitly.
    CLEANER_URL: undefined,
    CLEANER: undefined,
    CLEANER_OPTIONS: "",
    // Deterministic by default. Tests that care about throttling pass their own.
    RATE_LIMITER: allowAllLimiter(),
    ...overrides,
  } as unknown as Env;
}

export function allowAllLimiter(): RateLimit {
  return { limit: async () => ({ success: true }) } as RateLimit;
}

export function denyAllLimiter(): RateLimit {
  return { limit: async () => ({ success: false }) } as RateLimit;
}

/** Drives the Worker's fetch handler and settles any waitUntil() work. */
export async function call(request: Request, workerEnv: Env = testEnv()): Promise<Response> {
  const ctx = createExecutionContext();
  const response = await worker.fetch(request, workerEnv, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

export type UploadOptions = {
  name?: string;
  content?: string | Uint8Array;
  type?: string;
  ip?: string;
  idempotencyKey?: string;
  bearer?: string;
};

export async function upload(workerEnv: Env, options: UploadOptions = {}): Promise<Response> {
  // Markdown by default: .txt is now cleaned in-Worker by Layer A and never
  // reaches the cleaner, so tests exercising the cleaner must use a
  // container-kind extension. tests/layer-a-job.test.ts covers .txt.
  const name = options.name ?? "notes.md";
  const form = new FormData();
  form.set("file", new File([options.content ?? "hello"], name, { type: options.type ?? "text/plain" }), name);

  const headers = new Headers();
  if (options.ip) headers.set("cf-connecting-ip", options.ip);
  if (options.idempotencyKey) headers.set("idempotency-key", options.idempotencyKey);
  if (options.bearer) headers.set("authorization", `Bearer ${options.bearer}`);

  return call(new Request(`${ORIGIN}/api/upload`, { method: "POST", body: form, headers }), workerEnv);
}

export function getJob(workerEnv: Env, jobId: string): Promise<Response> {
  return call(new Request(`${ORIGIN}/api/jobs/${jobId}`), workerEnv);
}

export function download(workerEnv: Env, jobId: string): Promise<Response> {
  return call(new Request(`${ORIGIN}/api/jobs/${jobId}/download`), workerEnv);
}

// --- fake cleaner -----------------------------------------------------------

export type CleanerBehaviour =
  | { kind: "ok"; cleaned?: string; report?: unknown; reportKind?: string }
  | { kind: "http"; status: number; body?: unknown }
  | { kind: "unreachable"; message?: string };

export type FakeCleaner = {
  /** Drop-in for env.CLEANER (the Containers/Durable Object dispatch path). */
  namespace: DurableObjectNamespace;
  /** One entry per /clean call, with the decoded payload the Worker sent. */
  calls: { path: string; name?: string; fileBase64?: string; options?: unknown }[];
};

function cleanerResponse(behaviour: Extract<CleanerBehaviour, { kind: "ok" }>): Response {
  return Response.json({
    ok: true,
    kind: behaviour.reportKind ?? "text",
    cleaned: btoa(behaviour.cleaned ?? "cleaned output"),
    report: behaviour.report ?? { actions: ["strip_zero_width"], suspicious: false },
  });
}

export function fakeCleaner(behaviour: CleanerBehaviour): FakeCleaner {
  const calls: FakeCleaner["calls"] = [];

  const stub = {
    async fetch(input: string, init?: RequestInit): Promise<Response> {
      const path = new URL(input).pathname;
      const down = behaviour.kind === "unreachable";
      if (path === "/health") {
        if (down) throw new Error(behaviour.message ?? "connection refused");
        return Response.json({ ok: true, service: "watermarks-remover" });
      }
      const payload = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
      calls.push({
        path,
        name: typeof payload.name === "string" ? payload.name : undefined,
        fileBase64: typeof payload.file === "string" ? payload.file : undefined,
        options: payload.options,
      });
      if (behaviour.kind === "unreachable") {
        throw new Error(behaviour.message ?? "connection refused");
      }
      if (behaviour.kind === "http") {
        return Response.json(behaviour.body ?? { ok: false, error: "cleaner boom" }, {
          status: behaviour.status,
        });
      }
      return cleanerResponse(behaviour);
    },
  };

  const namespace = {
    idFromName: () => ({}),
    get: () => stub,
  } as unknown as DurableObjectNamespace;

  return { namespace, calls };
}

/** Env wired to a fake cleaner, so the whole clean pipeline runs for real. */
export function envWithCleaner(
  behaviour: CleanerBehaviour,
  overrides: Record<string, unknown> = {},
): { env: Env; cleaner: FakeCleaner } {
  const cleaner = fakeCleaner(behaviour);
  return { env: testEnv({ CLEANER: cleaner.namespace, ...overrides }), cleaner };
}

// --- queue ------------------------------------------------------------------

export type FakeBatch = {
  batch: MessageBatch<CleanMessage>;
  acked: string[];
  retried: string[];
};

/** A MessageBatch test double that records ack()/retry() per message. */
export function fakeBatch(bodies: unknown[]): FakeBatch {
  const acked: string[] = [];
  const retried: string[] = [];
  const messages = bodies.map((body, index) => {
    const id = `msg-${index}`;
    return {
      id,
      timestamp: new Date(),
      attempts: 1,
      body,
      ack: () => void acked.push(id),
      retry: () => void retried.push(id),
    };
  });
  const batch = {
    queue: "focairemover-clean",
    messages,
    ackAll: () => void messages.forEach((m) => acked.push(m.id)),
    retryAll: () => void messages.forEach((m) => retried.push(m.id)),
  } as unknown as MessageBatch<CleanMessage>;
  return { batch, acked, retried };
}

export async function runQueue(workerEnv: Env, batch: MessageBatch<CleanMessage>): Promise<void> {
  const ctx = createExecutionContext();
  await worker.queue?.(batch, workerEnv, ctx);
  await waitOnExecutionContext(ctx);
}

/** Collects what a queue producer binding was asked to send. */
export function recordingQueue(): { queue: Queue<CleanMessage>; sent: CleanMessage[] } {
  const sent: CleanMessage[] = [];
  const queue = {
    send: async (message: CleanMessage) => void sent.push(message),
    sendBatch: async () => undefined,
  } as unknown as Queue<CleanMessage>;
  return { queue, sent };
}
