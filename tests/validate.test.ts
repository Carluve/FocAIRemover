import assert from "node:assert/strict";
import test from "node:test";
import {
  assertAllowedFile,
  extensionOf,
  sanitizeDownloadName,
  ValidationError,
} from "../apps/worker/src/validate.ts";
import { r2CleanedKey, r2OriginalKey, JOB_ID_RE } from "../apps/worker/src/keys.ts";

test("extension allowlist accepts pdf and png", () => {
  assert.equal(assertAllowedFile("notes.pdf", "application/pdf", 12, 1000).extension, "pdf");
  assert.equal(assertAllowedFile("shot.PNG", "image/png", 12, 1000).extension, "png");
});

test("extension allowlist rejects exe and missing ext", () => {
  assert.throws(() => assertAllowedFile("x.exe", null, 12, 1000), ValidationError);
  assert.throws(() => assertAllowedFile("noext", null, 12, 1000), ValidationError);
});

test("size cap", () => {
  assert.throws(() => assertAllowedFile("a.txt", "text/plain", 50, 10), (err) => {
    return err instanceof ValidationError && err.status === 413;
  });
});

test("opaque r2 keys never embed the user filename", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  assert.equal(r2OriginalKey(id), `uploads/${id}/original`);
  assert.equal(r2CleanedKey(id), `uploads/${id}/cleaned`);
  assert.equal(r2OriginalKey(id).includes("secret.pdf"), false);
});

test("job id regex", () => {
  assert.equal(JOB_ID_RE.test("11111111-1111-4111-8111-111111111111"), true);
  assert.equal(JOB_ID_RE.test("../etc/passwd"), false);
  assert.equal(JOB_ID_RE.test("not-a-uuid"), false);
});

test("download name sanitizes path chars", () => {
  assert.equal(extensionOf("a/b/c.PDF"), "pdf");
  const name = sanitizeDownloadName("../../etc/passwd.txt", "txt");
  assert.equal(name.includes(".."), false);
  assert.equal(name, "passwd.cleaned.txt");
});
