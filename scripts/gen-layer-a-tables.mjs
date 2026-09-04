#!/usr/bin/env node
/**
 * Regenerate apps/worker/src/layer-a/tables.ts from upstream watermarks-remover.
 *
 *   python3 scripts/dump_layer_a_tables.py \
 *     ~/GitHub/watermarks-remover/service/scripts > /tmp/tables.json
 *   node scripts/gen-layer-a-tables.mjs apps/worker/src/layer-a/tables.ts /tmp/tables.json
 *
 * Extracting the tables instead of transcribing them is deliberate: these are
 * hundreds of codepoints where a single typo is invisible in review and would
 * silently corrupt user text.
 */
import { readFileSync, writeFileSync } from "node:fs";

const t = JSON.parse(readFileSync(process.argv[3] ?? "tables.json", "utf8"));
const hex = (n) => `0x${Number(n).toString(16).toUpperCase().padStart(4, "0")}`;

function set(name, arr, comment) {
  const body = arr.map(hex).join(", ");
  return `${comment}export const ${name}: ReadonlySet<number> = new Set([\n  ${body},\n]);\n`;
}
function ranges(name, arr, comment) {
  const body = arr.map(([a, b]) => `[${hex(a)}, ${hex(b)}]`).join(", ");
  return `${comment}export const ${name}: readonly (readonly [number, number])[] = [\n  ${body},\n];\n`;
}
function map(name, obj, comment) {
  const body = Object.entries(obj)
    .map(([k, v]) => `  [${hex(k)}, ${JSON.stringify(v)}],`)
    .join("\n");
  return `${comment}export const ${name}: ReadonlyMap<number, string> = new Map([\n${body}\n]);\n`;
}

const out = [
  `/**
 * Layer A character tables.
 *
 * GENERATED - do not edit by hand. Extracted verbatim from upstream
 * watermarks-remover \`service/scripts/text_unicode.py\` so the Worker and the
 * container agree character-for-character. Regenerate with
 * \`scripts/gen-layer-a-tables.mjs\` when upstream changes.
 *
 * Upstream: https://github.com/guillaumemeyer/watermarks-remover (MIT)
 * Copyright (c) Guillaume Meyer and contributors. See NOTICE.
 */
`,
  set("STRIP_CODEPOINTS", t.STRIP_CODEPOINTS, "/** Always-strip carriers. */\n"),
  map("SPACE_HOMOGLYPHS", t.SPACE_HOMOGLYPHS, "/** Replaced with a plain space when normalizeSpaces. */\n"),
  map("LATIN_CONFUSABLES", t.LATIN_CONFUSABLES, "/** Replaced only when aggressiveHomoglyphs. */\n"),
  ranges("VS_SUPPLEMENT", [t.VS_SUPPLEMENT], "/** Variation selectors supplement (half-open). */\n"),
  set("RESERVED_IGNORABLE_CPS", t.RESERVED_IGNORABLE_CPS, ""),
  ranges("RESERVED_IGNORABLE_RANGES", t.RESERVED_IGNORABLE_RANGES, ""),
  set("BIDI_CPS", t.BIDI_CPS, ""),
  set("PRESERVABLE_BIDI_CPS", t.PRESERVABLE_BIDI_CPS, "/** Legitimate in mixed RTL/LTR prose. */\n"),
  ranges(
    "LAYOUT_CF_CONTROLS",
    t.LAYOUT_CF_CONTROLS.flat(),
    "/** Flattened pairs: [controls, script] per entry, see layoutCfScript(). */\n",
  ),
  set("ZW_FAMILY", t.ZW_FAMILY, ""),
  set("EMOJI_GLUE_CODEPOINTS", t.EMOJI_GLUE_CODEPOINTS, ""),
  set("SCRIPT_JOINERS", t.SCRIPT_JOINERS, ""),
  ranges("TAG_RANGE", [t.TAG_RANGE], ""),
  set("ORTHOGRAPHIC_CF", t.ORTHOGRAPHIC_CF, ""),
  set("MONGOLIAN_FVS", t.MONGOLIAN_FVS, ""),
  set("KHMER_VOWELS", t.KHMER_VOWELS, ""),
  set("HANGUL_FILLERS", t.HANGUL_FILLERS, ""),
  set("SCRIPT_GLUE", t.SCRIPT_GLUE, ""),
].join("\n");

writeFileSync(process.argv[2], out);
console.log("wrote", process.argv[2], out.length, "bytes");
