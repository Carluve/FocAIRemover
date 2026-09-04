/**
 * Layer A character tables.
 *
 * GENERATED - do not edit by hand. Extracted verbatim from upstream
 * watermarks-remover `service/scripts/text_unicode.py` so the Worker and the
 * container agree character-for-character. Regenerate with
 * `scripts/gen-layer-a-tables.mjs` when upstream changes.
 *
 * Upstream: https://github.com/guillaumemeyer/watermarks-remover (MIT)
 * Copyright (c) Guillaume Meyer and contributors. See NOTICE.
 */

/** Always-strip carriers. */
export const STRIP_CODEPOINTS: ReadonlySet<number> = new Set([
  0x00AD, 0x034F, 0x061C, 0x115F, 0x1160, 0x17B4, 0x17B5, 0x180B, 0x180C, 0x180D, 0x180E, 0x180F, 0x200B, 0x200C, 0x200D, 0x200E, 0x200F, 0x202A, 0x202B, 0x202C, 0x202D, 0x202E, 0x2060, 0x2061, 0x2062, 0x2063, 0x2064, 0x2066, 0x2067, 0x2068, 0x2069, 0x206A, 0x206B, 0x206C, 0x206D, 0x206E, 0x206F, 0x3164, 0xFE00, 0xFE01, 0xFE02, 0xFE03, 0xFE04, 0xFE05, 0xFE06, 0xFE07, 0xFE08, 0xFE09, 0xFE0A, 0xFE0B, 0xFE0C, 0xFE0D, 0xFE0E, 0xFE0F, 0xFEFF, 0xFFA0, 0xFFF9, 0xFFFA, 0xFFFB,
]);

/** Replaced with a plain space when normalizeSpaces. */
export const SPACE_HOMOGLYPHS: ReadonlyMap<number, string> = new Map([
  [0x00A0, " "],
  [0x1680, " "],
  [0x2000, " "],
  [0x2001, " "],
  [0x2002, " "],
  [0x2003, " "],
  [0x2004, " "],
  [0x2005, " "],
  [0x2006, " "],
  [0x2007, " "],
  [0x2008, " "],
  [0x2009, " "],
  [0x200A, " "],
  [0x202F, " "],
  [0x205F, " "],
  [0x3000, " "],
]);

/** Replaced only when aggressiveHomoglyphs. */
export const LATIN_CONFUSABLES: ReadonlyMap<number, string> = new Map([
  [0x0410, "A"],
  [0x0412, "B"],
  [0x0415, "E"],
  [0x041A, "K"],
  [0x041C, "M"],
  [0x041D, "H"],
  [0x041E, "O"],
  [0x0420, "P"],
  [0x0421, "C"],
  [0x0422, "T"],
  [0x0425, "X"],
  [0x0430, "a"],
  [0x0435, "e"],
  [0x043E, "o"],
  [0x0440, "p"],
  [0x0441, "c"],
  [0x0443, "y"],
  [0x0445, "x"],
  [0x0456, "i"],
  [0xFF21, "A"],
  [0xFF22, "B"],
  [0xFF23, "C"],
  [0xFF24, "D"],
  [0xFF25, "E"],
  [0xFF26, "F"],
  [0xFF27, "G"],
  [0xFF28, "H"],
  [0xFF29, "I"],
  [0xFF2A, "J"],
  [0xFF2B, "K"],
  [0xFF2C, "L"],
  [0xFF2D, "M"],
  [0xFF2E, "N"],
  [0xFF2F, "O"],
  [0xFF30, "P"],
  [0xFF31, "Q"],
  [0xFF32, "R"],
  [0xFF33, "S"],
  [0xFF34, "T"],
  [0xFF35, "U"],
  [0xFF36, "V"],
  [0xFF37, "W"],
  [0xFF38, "X"],
  [0xFF39, "Y"],
  [0xFF3A, "Z"],
  [0xFF41, "a"],
  [0xFF42, "b"],
  [0xFF43, "c"],
  [0xFF44, "d"],
  [0xFF45, "e"],
  [0xFF46, "f"],
  [0xFF47, "g"],
  [0xFF48, "h"],
  [0xFF49, "i"],
  [0xFF4A, "j"],
  [0xFF4B, "k"],
  [0xFF4C, "l"],
  [0xFF4D, "m"],
  [0xFF4E, "n"],
  [0xFF4F, "o"],
  [0xFF50, "p"],
  [0xFF51, "q"],
  [0xFF52, "r"],
  [0xFF53, "s"],
  [0xFF54, "t"],
  [0xFF55, "u"],
  [0xFF56, "v"],
  [0xFF57, "w"],
  [0xFF58, "x"],
  [0xFF59, "y"],
  [0xFF5A, "z"],
]);

/** Variation selectors supplement (half-open). */
export const VS_SUPPLEMENT: readonly (readonly [number, number])[] = [
  [0xE0100, 0xE01F0],
];

export const RESERVED_IGNORABLE_CPS: ReadonlySet<number> = new Set([
  0x2065, 0xE0000,
]);

export const RESERVED_IGNORABLE_RANGES: readonly (readonly [number, number])[] = [
  [0xFFF0, 0xFFF9], [0xE0080, 0xE0100], [0xE01F0, 0xE1000],
];

export const BIDI_CPS: ReadonlySet<number> = new Set([
  0x061C, 0x200E, 0x200F, 0x202A, 0x202B, 0x202C, 0x202D, 0x202E, 0x2066, 0x2067, 0x2068, 0x2069,
]);

/** Legitimate in mixed RTL/LTR prose. */
export const PRESERVABLE_BIDI_CPS: ReadonlySet<number> = new Set([
  0x061C, 0x200E, 0x200F, 0x2066, 0x2067, 0x2068, 0x2069,
]);

/** Flattened pairs: [controls, script] per entry, see layoutCfScript(). */
export const LAYOUT_CF_CONTROLS: readonly (readonly [number, number])[] = [
  [0x13430, 0x13440], [0x13000, 0x14400], [0x1BCA0, 0x1BCA4], [0x1BC00, 0x1BCA4], [0x1D173, 0x1D17B], [0x1D100, 0x1D200],
];

export const ZW_FAMILY: ReadonlySet<number> = new Set([
  0x180E, 0x200B, 0x200C, 0x200D, 0x2060, 0xFEFF,
]);

export const EMOJI_GLUE_CODEPOINTS: ReadonlySet<number> = new Set([
  0x200D, 0xFE0E, 0xFE0F,
]);

export const SCRIPT_JOINERS: ReadonlySet<number> = new Set([
  0x200C, 0x200D,
]);

export const TAG_RANGE: readonly (readonly [number, number])[] = [
  [0xE0020, 0xE0080],
];

export const ORTHOGRAPHIC_CF: ReadonlySet<number> = new Set([
  0x0600, 0x0601, 0x0602, 0x0603, 0x0604, 0x0605, 0x06DD, 0x070F, 0x08E2, 0x110BD, 0x110CD,
]);

export const MONGOLIAN_FVS: ReadonlySet<number> = new Set([
  0x180B, 0x180C, 0x180D, 0x180F,
]);

export const KHMER_VOWELS: ReadonlySet<number> = new Set([
  0x17B4, 0x17B5,
]);

export const HANGUL_FILLERS: ReadonlySet<number> = new Set([
  0x115F, 0x1160, 0x3164, 0xFFA0,
]);

export const SCRIPT_GLUE: ReadonlySet<number> = new Set([
  0x115F, 0x1160, 0x17B4, 0x17B5, 0x180B, 0x180C, 0x180D, 0x180F, 0x3164, 0xFFA0,
]);
