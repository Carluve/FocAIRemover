import { describe, expect, test, vi } from "vitest";
import { download, getJob, realQueueEnv, upload } from "./helpers.ts";

/**
 * The other queue tests drive the consumer with a synthetic MessageBatch. These
 * use the REAL local queue bound in vitest.config.ts, so the producer's send(),
 * Queues' delivery and the exported queue() handler are all exercised together
 * — the wiring a test double cannot check.
 *
 * The payload is .txt on purpose: Layer A runs inside the Worker, so the
 * consumer needs no cleaner and the test stays hermetic.
 */

async function jobStatus(workerEnv: Env, jobId: string): Promise<Record<string, unknown>> {
  return (await (await getJob(workerEnv, jobId)).json()) as Record<string, unknown>;
}

describe("real Queues round trip", () => {
  test("a job sent to the queue is picked up and completed by the consumer", async () => {
    const workerEnv = realQueueEnv();
    const created = (await (await upload(workerEnv, {
      name: "ensayo.txt",
      content: "Texto​ con marcas​ invisibles.",
    })).json()) as Record<string, unknown>;
    const jobId = String(created.id);

    // The producer path must not clean inline.
    expect(created.status).toBe("queued");

    await vi.waitFor(
      async () => {
        expect((await jobStatus(workerEnv, jobId)).status).toBe("done");
      },
      { timeout: 15_000, interval: 100 },
    );

    expect(await (await download(workerEnv, jobId)).text()).toBe("Texto con marcas invisibles.");
  });

  test("delivers each job in a burst exactly once", async () => {
    const workerEnv = realQueueEnv();
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const created = (await (await upload(workerEnv, {
        name: `lote-${i}.txt`,
        content: `documento ${i}​`,
      })).json()) as Record<string, unknown>;
      ids.push(String(created.id));
    }

    await vi.waitFor(
      async () => {
        for (const id of ids) {
          expect((await jobStatus(workerEnv, id)).status).toBe("done");
        }
      },
      { timeout: 20_000, interval: 100 },
    );

    for (const [index, id] of ids.entries()) {
      expect(await (await download(workerEnv, id)).text()).toBe(`documento ${index}`);
      // attempts stays at 1: a redelivered job would claim and increment again.
      const status = await jobStatus(workerEnv, id);
      expect(status.attempts).toBe(1);
    }
  });
});
