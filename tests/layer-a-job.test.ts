import { env } from "cloudflare:test";
import { describe, expect, test } from "vitest";
import { r2ReportKey } from "../apps/worker/src/keys.ts";
import { download, envWithCleaner, getJob, testEnv, upload } from "./helpers.ts";

/**
 * Plain .txt is cleaned inside the Worker by the Layer A port, with no cleaner
 * and no model. `testEnv()` binds no CLEANER and no CLEANER_URL, so these tests
 * failing open would show up as a job error rather than a silent pass.
 */

async function cleanTxt(
  content: string,
  overrides: Record<string, unknown> = {},
): Promise<{ job: Record<string, unknown>; body: string }> {
  const workerEnv = testEnv(overrides);
  const created = (await (await upload(workerEnv, { name: "ensayo.txt", content })).json()) as Record<
    string,
    unknown
  >;
  const job = (await (await getJob(workerEnv, String(created.id))).json()) as Record<string, unknown>;
  const res = await download(workerEnv, String(created.id));
  return { job, body: res.status === 200 ? await res.text() : "" };
}

describe(".txt is cleaned by the Worker, with no cleaner configured", () => {
  test("removes invisible carriers and completes the job", async () => {
    const { job, body } = await cleanTxt("Este texto​ lleva marcas​ invisibles​.");

    expect(job.status).toBe("done");
    expect(job.error).toBeNull();
    expect(body).toBe("Este texto lleva marcas invisibles.");
    expect(body).not.toContain("​");
  });

  test("does not corrupt emoji, which a naive strip would", async () => {
    const text = "listo ❤️‍🔥 y 👨‍👩‍👧";
    const { job, body } = await cleanTxt(`${text}​`);

    expect(job.status).toBe("done");
    expect(body).toBe(text);
  });

  test("never reaches the cleaner even when one is bound", async () => {
    const { env: workerEnv, cleaner } = envWithCleaner({ kind: "ok" });
    const created = (await (await upload(workerEnv, {
      name: "ensayo.txt",
      content: "hola​",
    })).json()) as Record<string, unknown>;
    const job = (await (await getJob(workerEnv, String(created.id))).json()) as Record<
      string,
      unknown
    >;

    expect(job.status).toBe("done");
    expect(cleaner.calls).toHaveLength(0);
    expect(await (await download(workerEnv, String(created.id))).text()).toBe("hola");
  });

  test("states in the stored report that Layer B was not applied", async () => {
    const workerEnv = testEnv();
    const created = (await (await upload(workerEnv, {
      name: "ensayo.txt",
      content: "hola​",
    })).json()) as Record<string, unknown>;

    const stored = await env.FOCAI_FILES.get(r2ReportKey(String(created.id)));
    const report = JSON.parse(await stored!.text()) as Record<string, unknown>;

    expect(report.engine).toBe("worker-layer-a");
    expect(report.kind).toBe("text");
    expect(String(report.layer_b)).toMatch(/not applied/);
    expect(report.actions).toContain("layer A text: removed=1 replaced=0");
  });

  test("keeps the honesty note in the job summary", async () => {
    const { job } = await cleanTxt("hola​");
    const summary = job.reportSummary as Record<string, unknown>;

    expect(String(summary.note)).toMatch(/Never: Anthropic watermark guaranteed removed/);
    expect(String(summary.layer_b)).toMatch(/not applied/);
  });

  test("reports a clean file as done with nothing removed", async () => {
    const { job, body } = await cleanTxt("nada que limpiar aqui");

    expect(job.status).toBe("done");
    expect(body).toBe("nada que limpiar aqui");
  });

  test("honours CLEANER_OPTIONS flags", async () => {
    // normalize_spaces is on by default; turning it off must keep the U+3000.
    const wide = "ancho　espacio";
    expect((await cleanTxt(wide)).body).toBe("ancho espacio");
    expect((await cleanTxt(wide, { CLEANER_OPTIONS: '{"normalize_spaces":false}' })).body).toBe(wide);
  });

  test("rejects bytes that are not valid UTF-8 instead of mangling them", async () => {
    const invalid = new Uint8Array([0x68, 0x69, 0xff, 0xfe, 0x00]);
    const workerEnv = testEnv();
    const created = (await (await upload(workerEnv, {
      name: "raro.txt",
      content: invalid,
    })).json()) as Record<string, unknown>;
    const job = (await (await getJob(workerEnv, String(created.id))).json()) as Record<
      string,
      unknown
    >;

    expect(job.status).toBe("error");
    expect(String(job.error)).toMatch(/^not_utf8_text:/);
  });
});
