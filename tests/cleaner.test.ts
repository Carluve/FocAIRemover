import assert from "node:assert/strict";
import test from "node:test";
import { isLoopbackHostname, resolveCleanerUrl } from "../apps/worker/src/cleaner.ts";
import { summarizeReport } from "../apps/worker/src/reportSummary.ts";

test("loopback hostnames", () => {
  assert.equal(isLoopbackHostname("127.0.0.1"), true);
  assert.equal(isLoopbackHostname("127.0.0.2"), true);
  assert.equal(isLoopbackHostname("localhost"), true);
  assert.equal(isLoopbackHostname("::1"), true);
  assert.equal(isLoopbackHostname("[::1]"), true);
  assert.equal(isLoopbackHostname("::ffff:127.0.0.1"), true);
  assert.equal(isLoopbackHostname("[::ffff:127.0.0.1]"), true);
  assert.equal(isLoopbackHostname("::ffff:7f00:1"), true);
  assert.equal(isLoopbackHostname("cleaner.example"), false);
  assert.equal(isLoopbackHostname("8.8.8.8"), false);
  assert.equal(isLoopbackHostname("::ffff:8.8.8.8"), false);
});

test("production rejects CLEANER_URL localhost", () => {
  const resolved = resolveCleanerUrl({
    ENVIRONMENT: "production",
    CLEANER_URL: "http://127.0.0.1:8765",
  } as Env);
  assert.equal(resolved.url, null);
  assert.equal(resolved.reason, "loopback_unreachable_in_production");
});

test("production rejects IPv4-mapped IPv6 loopback CLEANER_URL", () => {
  const resolved = resolveCleanerUrl({
    ENVIRONMENT: "production",
    CLEANER_URL: "http://[::ffff:127.0.0.1]:8765",
  } as Env);
  assert.equal(resolved.url, null);
  assert.equal(resolved.reason, "loopback_unreachable_in_production");
});

test("development allows local CLEANER_URL", () => {
  const resolved = resolveCleanerUrl({
    ENVIRONMENT: "development",
    CLEANER_URL: "http://127.0.0.1:8765/",
  } as Env);
  assert.equal(resolved.url, "http://127.0.0.1:8765");
});

test("invalid CLEANER_URL", () => {
  const resolved = resolveCleanerUrl({
    ENVIRONMENT: "production",
    CLEANER_URL: "not-a-url",
  } as Env);
  assert.equal(resolved.url, null);
  assert.equal(resolved.reason, "invalid_cleaner_url");
});

test("report summary stays honest", () => {
  const summary = summarizeReport("text", {
    backend: "worker-layer-a",
    removedCount: 2,
    layer: "A",
  });
  assert.equal(summary.kind, "text");
  assert.equal(summary.removedCount, 2);
  assert.match(String(summary.note), /Never: Anthropic watermark guaranteed removed/);
});
