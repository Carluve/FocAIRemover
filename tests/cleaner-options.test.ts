import { describe, expect, test } from "vitest";
import { cleanerOptions } from "../apps/worker/src/cleaner.ts";
import { envWithCleaner, getJob, testEnv, upload } from "./helpers.ts";

/**
 * Upstream watermarks-remover routes by extension and makes a Layer B rewrite
 * MANDATORY for the `text` kind, so plain .txt returns 400 unless a rewrite
 * backend is configured. .md / .html / images / PDF clean with Layer A only.
 * These tests pin that contract from the Worker's side.
 */

function optionsFrom(value: string | undefined): Record<string, unknown> {
  return cleanerOptions(testEnv({ CLEANER_OPTIONS: value }));
}

describe("cleanerOptions", () => {
  test("defaults to Layer A only", () => {
    expect(optionsFrom(undefined)).toEqual({});
    expect(optionsFrom("")).toEqual({});
    expect(optionsFrom("   ")).toEqual({});
  });

  test("passes a configured strategy through", () => {
    expect(optionsFrom('{"strategy":"paraphrase@0.8"}')).toEqual({ strategy: "paraphrase@0.8" });
  });

  test("falls back to Layer A rather than sending junk upstream", () => {
    expect(optionsFrom("not json")).toEqual({});
    expect(optionsFrom("[1,2]")).toEqual({});
    expect(optionsFrom("null")).toEqual({});
  });
});

describe("options reach the cleaner", () => {
  test("sends an empty options object by default", async () => {
    const { env: workerEnv, cleaner } = envWithCleaner({ kind: "ok" });
    await upload(workerEnv, { name: "notas.md" });

    expect(cleaner.calls[0]!.options).toEqual({});
  });

  test("sends the operator's strategy when CLEANER_OPTIONS is set", async () => {
    const { env: workerEnv, cleaner } = envWithCleaner(
      { kind: "ok" },
      { CLEANER_OPTIONS: '{"strategy":"paraphrase@0.8","nfkc":true}' },
    );
    await upload(workerEnv, { name: "notas.md" });

    expect(cleaner.calls[0]!.options).toEqual({ strategy: "paraphrase@0.8", nfkc: true });
  });
});

describe("Layer B rejection is explained, not echoed", () => {
  test("a .txt rejected for Layer B fails permanently with actionable text", async () => {
    const { env: workerEnv } = envWithCleaner({
      kind: "http",
      status: 400,
      body: {
        ok: false,
        error: "Layer B strategy needs an LLM rewrite backend (WATERMARKS_REWRITE_BACKEND)",
      },
    });

    const created = (await (await upload(workerEnv, { name: "ensayo.txt" })).json()) as Record<
      string,
      unknown
    >;
    const job = (await (await getJob(workerEnv, String(created.id))).json()) as Record<
      string,
      unknown
    >;

    // Permanent: retrying a missing backend can never succeed.
    expect(job.status).toBe("error");
    const error = String(job.error);
    expect(error).toMatch(/^layer_b_required:/);
    expect(error).toMatch(/\.md, \.html, images and PDFs/);
    // The upstream wording is preserved for debugging.
    expect(error).toMatch(/WATERMARKS_REWRITE_BACKEND/);
  });

  test("other 4xx errors are passed through untouched", async () => {
    const { env: workerEnv } = envWithCleaner({
      kind: "http",
      status: 415,
      body: { ok: false, error: "unsupported_kind" },
    });

    const created = (await (await upload(workerEnv, { name: "x.md" })).json()) as Record<
      string,
      unknown
    >;
    const job = (await (await getJob(workerEnv, String(created.id))).json()) as Record<
      string,
      unknown
    >;

    expect(job.status).toBe("error");
    expect(job.error).toBe("unsupported_kind");
  });
});
