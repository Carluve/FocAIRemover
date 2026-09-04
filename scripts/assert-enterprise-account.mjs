#!/usr/bin/env node
/**
 * Refuse deploy/migrate against the personal Cloudflare account.
 * Enterprise: 39f8ea10b94ad38470fc3c20c260efdc
 */
const ENTERPRISE = "39f8ea10b94ad38470fc3c20c260efdc";
const PERSONAL = "052a5feff6731a169b7012425b020cc5";

const fromEnv = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
if (fromEnv === PERSONAL) {
  console.error(
    "Refusing to run against the personal Cloudflare account",
    PERSONAL,
    "— use enterprise",
    ENTERPRISE,
  );
  process.exit(1);
}
if (fromEnv && fromEnv !== ENTERPRISE) {
  console.error("CLOUDFLARE_ACCOUNT_ID is not the enterprise account:", fromEnv);
  process.exit(1);
}
process.env.CLOUDFLARE_ACCOUNT_ID = ENTERPRISE;
