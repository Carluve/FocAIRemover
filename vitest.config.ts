import path from "node:path";
import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

// Tests run inside workerd with the real R2, D1 and rate-limit bindings from
// wrangler.jsonc, so they exercise the deployed runtime rather than a stub.
const here = path.dirname(fileURLToPath(import.meta.url));
const migrations = await readD1Migrations(path.join(here, "migrations"));

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        // Handed to applyD1Migrations() in tests/setup.ts. workerd cannot read
        // the migrations directory itself, so Node passes it in as a binding.
        bindings: { TEST_MIGRATIONS: migrations },
        // A real local queue, so producer -> Queues -> consumer is exercised
        // rather than mocked. The wrangler.jsonc block stays commented until
        // the queues exist on the account; this binds them for tests only.
        // testEnv() clears CLEAN_QUEUE by default so only the queue tests see it.
        queueProducers: { CLEAN_QUEUE: "focairemover-clean" },
        queueConsumers: {
          "focairemover-clean": { maxBatchSize: 1, maxBatchTimeout: 0, maxRetries: 3 },
        },
      },
    }),
  ],
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
  },
});
