import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll } from "vitest";

// Storage is isolated per test file, so every file needs the schema.
beforeAll(async () => {
  await applyD1Migrations(env.JOBS, env.TEST_MIGRATIONS);
});
