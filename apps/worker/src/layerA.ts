/**
 * Worker-native Layer A — invisible Unicode strip.
 *
 * Independent of watermarks-remover (this repo does not vendor their tables).
 * Conservative keep-list for script-critical invisibles (emoji ZWJ, ZWNJ,
 * variation selectors, emoji tags, Arabic/Khmer/Hangul layout marks).
 *
 * Verifiable: re-inspect the output; stripped code points are listed in the
 * report. Does **not** touch statistical / Anthropic token-sampling marks.
 */

export const LAYER_A_TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "html",
  "htm",
  "svg",
]);

/** Code points stripped as provenance / stealth marks (not layout-critical). */
const STRIP = new Set<number>([
  0x00ad, // soft hyphen
  0x034f, // combining grapheme joiner
  0x180e, // mongolian vowel separator (deprecated)
  0x200b, // zero width space
  0x2060, // word joiner
  0x2061,
  0x2062,
  0x2063,
  0x2064, // invisible math operators
  0x2065, // reserved default-ignorable
  0x206a,
  0x206b,
  0x206c,
  0x206d,
  0x206e,
  0x206f, // deprecated inhibit/activate
  0xfeff, // BOM / ZWNBSP
  0xfff9,
  0xfffa,
  0xfffb, // interlinear annotation
  0xe0001, // language tag (not used by flag emoji)
]);

for (let cp = 0x202a; cp <= 0x202e; cp++) STRIP.add(cp); // bidi embeddings / overrides
for (let cp = 0x2066; cp <= 0x2069; cp++) STRIP.add(cp); // bidi isolates

export function isLayerATextExtension(extension: string): boolean {
  return LAYER_A_TEXT_EXTENSIONS.has(extension.toLowerCase());
}

export type LayerAResult = {
  cleaned: string;
  removedCount: number;
  removed: Record<string, number>;
};

export function cleanLayerA(text: string): LayerAResult {
  let cleaned = "";
  const removed: Record<string, number> = {};
  let removedCount = 0;

  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) continue;
    if (shouldStrip(cp)) {
      const key = `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
      removed[key] = (removed[key] ?? 0) + 1;
      removedCount += 1;
      continue;
    }
    cleaned += ch;
  }

  return { cleaned, removedCount, removed };
}

export function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function encodeUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function shouldStrip(cp: number): boolean {
  if (STRIP.has(cp)) return true;
  // C0 controls except tab / LF / CR
  if (cp < 0x20 && cp !== 0x09 && cp !== 0x0a && cp !== 0x0d) return true;
  // DEL
  if (cp === 0x7f) return true;
  return false;
}
