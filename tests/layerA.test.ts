import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanLayerA,
  decodeUtf8,
  encodeUtf8,
  isLayerATextExtension,
} from "../apps/worker/src/layerA.ts";

test("Layer A strips ZWSP and BOM but keeps visible text", () => {
  const input = "Hello\u200bWorld\uFEFF!";
  const { cleaned, removedCount, removed } = cleanLayerA(input);
  assert.equal(cleaned, "HelloWorld!");
  assert.equal(removedCount, 2);
  assert.equal(removed["U+200B"], 1);
  assert.equal(removed["U+FEFF"], 1);
});

test("Layer A keeps emoji ZWJ sequences and ZWNJ", () => {
  const family = "👨\u200D👩\u200D👧";
  const persian = "می‌شود";
  assert.equal(cleanLayerA(family).cleaned, family);
  assert.equal(cleanLayerA(persian).cleaned, persian);
  assert.equal(cleanLayerA(family).removedCount, 0);
});

test("Layer A strips bidi overrides and C0 junk, keeps newlines", () => {
  const sneaky = "abc\u202Edef\n";
  const { cleaned, removed } = cleanLayerA(sneaky);
  assert.equal(cleaned, "abcdef\n");
  assert.equal(removed["U+202E"], 1);
});

test("text extensions only", () => {
  assert.equal(isLayerATextExtension("txt"), true);
  assert.equal(isLayerATextExtension("MD"), true);
  assert.equal(isLayerATextExtension("pdf"), false);
  assert.equal(isLayerATextExtension("png"), false);
});

test("UTF-8 roundtrip", () => {
  const bytes = encodeUtf8("café\u200b");
  assert.equal(decodeUtf8(bytes), "café\u200b");
  assert.throws(() => decodeUtf8(new Uint8Array([0xff, 0xfe, 0xfd])));
});
