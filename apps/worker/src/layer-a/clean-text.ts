/**
 * Layer A: invisible-Unicode cleaning for plain text, in the Worker.
 *
 * A faithful port of upstream watermarks-remover `clean_text()` from
 * `service/scripts/text_unicode.py`. Upstream makes a Layer B (LLM) rewrite
 * mandatory for its `text` kind, so plain .txt cannot be cleaned by the
 * container at all without sending the user's prose to a model. Layer A is
 * verifiable and needs no model, so the Worker does it directly — which is what
 * `containers/cleaner/README.md` planned for v1 all along.
 *
 * The character tables in `./tables.ts` are extracted verbatim from upstream so
 * the two implementations agree character-for-character; `scripts/e2e.mjs`
 * diffs this port against a live upstream service to prove it.
 *
 * Why this is not a regex: ZWJ, variation selectors and tag characters are
 * load-bearing inside emoji sequences (❤️‍🔥, 👨‍👩‍👧, 🏴󠁧󠁢󠁳󠁣󠁴󠁿), inside complex-script
 * orthography (Persian می‌روم, Devanagari क्‍ष) and inside bidi runs. Stripping
 * them blindly corrupts real text, so every decision is context-sensitive.
 *
 * Upstream: https://github.com/guillaumemeyer/watermarks-remover (MIT)
 * Copyright (c) Guillaume Meyer and contributors. See NOTICE.
 */

import {
  BIDI_CPS,
  EMOJI_GLUE_CODEPOINTS,
  HANGUL_FILLERS,
  KHMER_VOWELS,
  LATIN_CONFUSABLES,
  LAYOUT_CF_CONTROLS,
  MONGOLIAN_FVS,
  ORTHOGRAPHIC_CF,
  PRESERVABLE_BIDI_CPS,
  RESERVED_IGNORABLE_CPS,
  RESERVED_IGNORABLE_RANGES,
  SCRIPT_GLUE,
  SCRIPT_JOINERS,
  SPACE_HOMOGLYPHS,
  STRIP_CODEPOINTS,
  TAG_RANGE,
  VS_SUPPLEMENT,
  ZW_FAMILY,
} from "./tables";

export type CleanTextOptions = {
  nfkc?: boolean;
  aggressiveHomoglyphs?: boolean;
  /** Upstream defaults this to true. */
  normalizeSpaces?: boolean;
  stripEmojiGlue?: boolean;
  stripBidi?: boolean;
};

export type CleanTextStats = {
  /** Code points, not UTF-16 code units — upstream counts Python characters. */
  inputLength: number;
  outputLength: number;
  removed: Record<string, number>;
  replaced: Record<string, number>;
  removedCount: number;
  replacedCount: number;
  nfkcChanged: boolean;
};

const inRange = (cp: number, [start, stop]: readonly [number, number]): boolean =>
  cp >= start && cp < stop;

const LETTER = /\p{L}/u;
const LETTER_OR_MARK = /[\p{L}\p{M}]/u;
const FORMAT = /\p{Cf}/u;

const isLetter = (cp: number): boolean => LETTER.test(String.fromCodePoint(cp));

function isReservedIgnorable(cp: number): boolean {
  if (RESERVED_IGNORABLE_CPS.has(cp)) return true;
  return RESERVED_IGNORABLE_RANGES.some((r) => inRange(cp, r));
}

/** The 66 Unicode noncharacters: U+FDD0..U+FDEF and U+nFFFE/U+nFFFF. */
function isNoncharacter(cp: number): boolean {
  return (cp >= 0xfdd0 && cp <= 0xfdef) || (cp & 0xfffe) === 0xfffe;
}

function isPrivateUse(cp: number): boolean {
  return (
    (cp >= 0xe000 && cp <= 0xf8ff) ||
    (cp >= 0xf0000 && cp <= 0xffffd) ||
    (cp >= 0x100000 && cp <= 0x10fffd)
  );
}

const isVsSupplement = (cp: number): boolean => inRange(cp, VS_SUPPLEMENT[0]!);
const isTagChar = (cp: number): boolean => inRange(cp, TAG_RANGE[0]!);

function isStripCp(cp: number): boolean {
  if (STRIP_CODEPOINTS.has(cp)) return true;
  if (isVsSupplement(cp)) return true;
  // Tag characters used in some stego schemes.
  if (cp >= 0xe0001 && cp <= 0xe007f) return true;
  if (isNoncharacter(cp)) return true;
  if (isReservedIgnorable(cp)) return true;
  return isPrivateUse(cp);
}

function stripKind(cp: number): string {
  if (cp >= 0xe0001 && cp <= 0xe007f) return "tag_chars";
  if (isNoncharacter(cp)) return "noncharacter";
  if (isReservedIgnorable(cp)) return "reserved_ignorable";
  if (isVsSupplement(cp) || (cp >= 0xfe00 && cp <= 0xfe0f) || MONGOLIAN_FVS.has(cp)) {
    return "variation_selector";
  }
  if (BIDI_CPS.has(cp)) return "bidi";
  if (ZW_FAMILY.has(cp)) return "zwj_family";
  if (isPrivateUse(cp)) return "private_use";
  return "strip";
}

const isEmojiGlue = (cp: number): boolean => EMOJI_GLUE_CODEPOINTS.has(cp);

/** Characters that can start or continue an emoji sequence. */
function isEmojiBase(cp: number): boolean {
  if (cp >= 0x1f000 && cp <= 0x1faff) return true;
  if (cp >= 0x2190 && cp <= 0x25ff) return true;
  if (cp >= 0x2600 && cp <= 0x27bf) return true;
  if (cp >= 0x2b00 && cp <= 0x2bff) return true;
  if ([0x203c, 0x2049, 0x2139, 0x2934, 0x2935].includes(cp)) return true;
  if ([0x00a9, 0x00ae, 0x2122, 0x3030, 0x303d, 0x3297, 0x3299].includes(cp)) return true;
  // keycap bases
  return cp === 0x0023 || cp === 0x002a || (cp >= 0x0030 && cp <= 0x0039);
}

/** Broad script group where ZWJ/ZWNJ can be orthographic. */
function joiningScript(cp: number): string | null {
  const groups: readonly [number, number, string][] = [
    [0x0600, 0x08ff, "arabic"],
    [0x0900, 0x0dff, "indic"],
    [0x0f00, 0x109f, "south-asian"],
    [0x1780, 0x17ff, "khmer"],
    [0x1800, 0x18af, "mongolian"],
  ];
  for (const [start, end, name] of groups) {
    if (cp >= start && cp <= end && LETTER_OR_MARK.test(String.fromCodePoint(cp))) {
      return name;
    }
  }
  return null;
}

function isCjkIdeograph(cp: number): boolean {
  return (
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0x20000 && cp <= 0x323af)
  );
}

const isMongolianBase = (cp: number): boolean => cp >= 0x1800 && cp <= 0x18af;
const isMongolianLetter = (cp: number): boolean => isMongolianBase(cp) && isLetter(cp);
const isKhmerLetter = (cp: number): boolean => cp >= 0x1780 && cp <= 0x17ff && isLetter(cp);

function isHangulJamo(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x11ff) ||
    (cp >= 0xa960 && cp <= 0xa97c) ||
    (cp >= 0xd7b0 && cp <= 0xd7c6) ||
    (cp >= 0x3131 && cp <= 0x318e) ||
    (cp >= 0xffa1 && cp <= 0xffdc)
  );
}

const isVariationSelector = (cp: number): boolean =>
  isVsSupplement(cp) || (cp >= 0xfe00 && cp <= 0xfe0f) || MONGOLIAN_FVS.has(cp);

/** Load-bearing invisible char: never advances `prevKept`. */
function isGlue(cp: number): boolean {
  return (
    isEmojiGlue(cp) ||
    isVariationSelector(cp) ||
    SCRIPT_JOINERS.has(cp) ||
    isTagChar(cp) ||
    SCRIPT_GLUE.has(cp)
  );
}

/** `[controls, script]` pairs, flattened in the generated table. */
function layoutCfScript(cp: number): readonly [number, number] | null {
  for (let i = 0; i + 1 < LAYOUT_CF_CONTROLS.length; i += 2) {
    const controls = LAYOUT_CF_CONTROLS[i]!;
    if (inRange(cp, controls)) return LAYOUT_CF_CONTROLS[i + 1]!;
  }
  return null;
}

/** Indices inside complete subdivision-flag tag sequences. */
function validFlagTagIndices(cps: number[]): Set<number> {
  const valid = new Set<number>();
  let i = 0;
  while (i < cps.length) {
    if (cps[i] !== 0x1f3f4) {
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < cps.length && cps[j]! >= 0xe0020 && cps[j]! <= 0xe007e) j += 1;
    if (j > i + 1 && j < cps.length && cps[j] === 0xe007f) {
      for (let k = i + 1; k <= j; k++) valid.add(k);
      i = j + 1;
    } else {
      i += 1;
    }
  }
  return valid;
}

/** Indices in complete LRE/RLE ... PDF pairs, excluding overrides. */
function validBidiEmbeddingIndices(cps: number[]): Set<number> {
  const valid = new Set<number>();
  const stack: [number, number][] = [];
  cps.forEach((cp, index) => {
    if (cp === 0x202a || cp === 0x202b || cp === 0x202d || cp === 0x202e) {
      stack.push([cp, index]);
    } else if (cp === 0x202c) {
      const top = stack.pop();
      if (!top) return;
      const [opener, openerIndex] = top;
      if (opener === 0x202a || opener === 0x202b) {
        valid.add(openerIndex);
        valid.add(index);
      }
    }
  });
  return valid;
}

type Decision = { action: "keep" | "strip" | "replace"; out: string; kind: string | null };

const KEEP = (ch: string): Decision => ({ action: "keep", out: ch, kind: null });

function decide(
  cp: number,
  prevKept: number | null,
  prevInput: number | null,
  nextInput: number | null,
  ctx: {
    validFlagTag: boolean;
    validBidiEmbedding: boolean;
    normalizeSpaces: boolean;
    treatConfusables: boolean;
    stripEmojiGlue: boolean;
    stripBidi: boolean;
  },
): Decision {
  const ch = String.fromCodePoint(cp);

  if (ctx.validBidiEmbedding && !ctx.stripBidi) return KEEP(ch);
  if (PRESERVABLE_BIDI_CPS.has(cp) && !ctx.stripBidi) return KEEP(ch);

  if (prevInput !== null && !ctx.stripEmojiGlue) {
    if (isVsSupplement(cp) && isCjkIdeograph(prevInput)) return KEEP(ch);
    if (MONGOLIAN_FVS.has(cp) && isMongolianBase(prevInput)) return KEEP(ch);
    if (cp >= 0xfe00 && cp <= 0xfe0d && isCjkIdeograph(prevInput)) return KEEP(ch);
  }

  if (isEmojiGlue(cp) && !ctx.stripEmojiGlue) {
    if ((cp === 0xfe0e || cp === 0xfe0f) && prevInput !== null && isEmojiBase(prevInput)) {
      return KEEP(ch);
    }
    if (
      cp === 0x200d &&
      prevKept !== null &&
      nextInput !== null &&
      isEmojiBase(prevKept) &&
      isEmojiBase(nextInput)
    ) {
      return KEEP(ch);
    }
  }

  if (!ctx.stripEmojiGlue) {
    if (SCRIPT_JOINERS.has(cp) && prevInput !== null && nextInput !== null) {
      const prevScript = joiningScript(prevInput);
      const nextScript = joiningScript(nextInput);
      if (prevScript !== null && prevScript === nextScript) return KEEP(ch);
    }
    if (isTagChar(cp) && ctx.validFlagTag) return KEEP(ch);
    if (MONGOLIAN_FVS.has(cp) && prevKept !== null && isMongolianLetter(prevKept)) return KEEP(ch);
    if (KHMER_VOWELS.has(cp) && prevKept !== null && isKhmerLetter(prevKept)) return KEEP(ch);
    if (HANGUL_FILLERS.has(cp) && prevKept !== null && isHangulJamo(prevKept)) return KEEP(ch);
    if (ORTHOGRAPHIC_CF.has(cp)) return KEEP(ch);
    const script = layoutCfScript(cp);
    if (
      script !== null &&
      ((prevInput !== null && inRange(prevInput, script)) ||
        (nextInput !== null && inRange(nextInput, script)))
    ) {
      return KEEP(ch);
    }
  }

  if (isStripCp(cp)) return { action: "strip", out: "", kind: stripKind(cp) };
  if (ctx.normalizeSpaces && SPACE_HOMOGLYPHS.has(cp)) {
    return { action: "replace", out: SPACE_HOMOGLYPHS.get(cp)!, kind: "space" };
  }
  if (ctx.treatConfusables && LATIN_CONFUSABLES.has(cp)) {
    return { action: "replace", out: LATIN_CONFUSABLES.get(cp)!, kind: "confusable" };
  }
  if (FORMAT.test(ch) && !SPACE_HOMOGLYPHS.has(cp)) {
    return { action: "strip", out: "", kind: "other_cf" };
  }
  return KEEP(ch);
}

/**
 * Upstream labels counters with the Unicode character name, which workerd
 * cannot resolve. The codepoint plus kind is the closest stable equivalent;
 * cleaned *bytes* are identical either way, which is what the port guarantees.
 */
function charLabel(cp: number, kind: string | null): string {
  const hex = cp.toString(16).toUpperCase().padStart(4, "0");
  return `U+${hex} (${kind ?? "unknown"})`;
}

export function cleanText(
  text: string,
  options: CleanTextOptions = {},
): { text: string; stats: CleanTextStats } {
  const normalizeSpaces = options.normalizeSpaces ?? true;
  // Python iterates code points; JS strings are UTF-16, so astral characters
  // (every emoji) would otherwise be split into surrogate halves.
  const cps = Array.from(text, (ch) => ch.codePointAt(0)!);
  const validFlagTags = validFlagTagIndices(cps);
  const validBidi = validBidiEmbeddingIndices(cps);

  const removed: Record<string, number> = {};
  const replaced: Record<string, number> = {};
  const out: string[] = [];
  let prevKept: number | null = null;

  for (let i = 0; i < cps.length; i++) {
    const cp = cps[i]!;
    const decision = decide(cp, prevKept, i > 0 ? cps[i - 1]! : null, cps[i + 1] ?? null, {
      validFlagTag: validFlagTags.has(i),
      validBidiEmbedding: validBidi.has(i),
      normalizeSpaces,
      treatConfusables: options.aggressiveHomoglyphs ?? false,
      stripEmojiGlue: options.stripEmojiGlue ?? false,
      stripBidi: options.stripBidi ?? false,
    });

    if (decision.action === "keep") {
      out.push(decision.out);
      // Glue does not advance the kept base, so ZWJ chains stay bound.
      if (!isGlue(cp)) prevKept = decision.out.codePointAt(0) ?? null;
    } else if (decision.action === "replace") {
      out.push(decision.out);
      const label = charLabel(cp, decision.kind);
      replaced[label] = (replaced[label] ?? 0) + 1;
      prevKept = decision.out.codePointAt(0) ?? null;
    } else {
      const label = charLabel(cp, decision.kind);
      removed[label] = (removed[label] ?? 0) + 1;
      // prevKept unchanged
    }
  }

  let result = out.join("");
  let nfkcChanged = false;
  if (options.nfkc) {
    const before = result;
    result = result.normalize("NFKC");
    if (result !== before) {
      nfkcChanged = true;
      replaced.NFKC_normalize = (replaced.NFKC_normalize ?? 0) + 1;
    }
  }

  const sum = (counter: Record<string, number>): number =>
    Object.values(counter).reduce((total, n) => total + n, 0);

  return {
    text: result,
    stats: {
      inputLength: cps.length,
      outputLength: Array.from(result).length,
      removed,
      replaced,
      removedCount: sum(removed),
      replacedCount: sum(replaced),
      nfkcChanged,
    },
  };
}
