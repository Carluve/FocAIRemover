import { describe, expect, test } from "vitest";
import { cleanText, type CleanTextOptions } from "../apps/worker/src/layer-a/clean-text.ts";
import corpus from "./fixtures/layer-a-corpus.json";

/**
 * Differential test. Every expected value in the fixture was produced by the
 * REAL upstream Python `clean_text()` (see scripts/gen_layer_a_fixture.py), so
 * these assertions pin the TypeScript port to upstream behaviour rather than to
 * my reading of it. Regenerate the fixture when upstream changes.
 */

type Case = {
  input: string;
  options: Record<string, boolean>;
  expected: string;
};

function toOptions(pythonOptions: Record<string, boolean>): CleanTextOptions {
  return {
    nfkc: pythonOptions.nfkc,
    aggressiveHomoglyphs: pythonOptions.aggressive_homoglyphs,
    normalizeSpaces: pythonOptions.normalize_spaces,
    stripEmojiGlue: pythonOptions.strip_emoji_glue,
    stripBidi: pythonOptions.strip_bidi,
  };
}

const cases = corpus as Case[];

describe("Layer A port matches upstream character-for-character", () => {
  test("the fixture is substantial enough to mean something", () => {
    expect(cases.length).toBeGreaterThan(2000);
  });

  test(`all ${cases.length} upstream cases produce identical output`, () => {
    const mismatches: { input: string; options: unknown; expected: string; got: string }[] = [];

    for (const item of cases) {
      const got = cleanText(item.input, toOptions(item.options)).text;
      if (got !== item.expected) {
        mismatches.push({ input: item.input, options: item.options, expected: item.expected, got });
      }
    }

    // Show codepoints, not glyphs: these differences are invisible by design.
    const describeCase = (m: (typeof mismatches)[number]): string => {
      const cps = (s: string) =>
        Array.from(s, (c) => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`).join(" ");
      return `options=${JSON.stringify(m.options)}\n  in:  ${cps(m.input)}\n  py:  ${cps(m.expected)}\n  ts:  ${cps(m.got)}`;
    };

    expect(
      mismatches.length,
      mismatches.length ? `\n${mismatches.slice(0, 5).map(describeCase).join("\n\n")}` : "",
    ).toBe(0);
  });
});

describe("Layer A behaviour worth stating outright", () => {
  test("strips the invisible carriers this project is named for", () => {
    const { text, stats } = cleanText("Este texto​ lleva​ marcas​.");
    expect(text).toBe("Este texto lleva marcas.");
    expect(stats.removedCount).toBe(3);
  });

  test("does NOT corrupt emoji held together by zero-width joiners", () => {
    // ❤️‍🔥 is U+2764 U+FE0F U+200D U+1F525 — every one of the invisible parts
    // is load-bearing. A naive strip would leave a plain heart and a fire.
    const heartOnFire = "❤️‍🔥";
    expect(cleanText(heartOnFire).text).toBe(heartOnFire);
    expect(cleanText(`hola ${heartOnFire} adios`).text).toBe(`hola ${heartOnFire} adios`);
  });

  test("keeps a complete subdivision flag but strips orphan tag characters", () => {
    const scotland = "🏴󠁧󠁢󠁳󠁣󠁴󠁿";
    expect(cleanText(scotland).text).toBe(scotland);
    expect(cleanText("abc󠁁def").text).toBe("abcdef");
  });

  test("keeps ZWNJ that is orthographic in Persian", () => {
    const persian = "می‌روم";
    expect(cleanText(persian).text).toBe(persian);
  });

  test("strips a zero-width joiner that joins nothing", () => {
    expect(cleanText("plain‍text").text).toBe("plaintext");
  });

  test("normalises space homoglyphs by default and reports them as replaced", () => {
    const { text, stats } = cleanText("wide　space");
    expect(text).toBe("wide space");
    expect(stats.replacedCount).toBe(1);
    expect(stats.removedCount).toBe(0);
  });

  test("counts lengths in code points, not UTF-16 units", () => {
    const { stats } = cleanText("😀​");
    expect(stats.inputLength).toBe(2);
    expect(stats.outputLength).toBe(1);
  });
});
