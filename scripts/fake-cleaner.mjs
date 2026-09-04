#!/usr/bin/env node
/**
 * NOT a cleaner. A test fixture.
 *
 * Implements just enough of the watermarks-remover HTTP contract (`/health`,
 * `/clean`) to exercise the Worker's upload -> clean -> download path without
 * Docker. It only strips invisible Unicode, so it must never be mistaken for
 * the real thing: it does nothing to C2PA/EXIF/XMP metadata and nothing at all
 * to statistical text watermarks.
 *
 *   node scripts/fake-cleaner.mjs          # 127.0.0.1:8765
 *   PORT=8799 node scripts/fake-cleaner.mjs
 *
 * Pair it with CLEANER_URL in .dev.vars, then `npm run e2e`.
 */
import { createServer } from "node:http";

const PORT = Number(process.env.PORT || 8765);
const ZERO_WIDTH = /[​‌‍⁠﻿]/g;

createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "fake-watermarks-remover" }));
    return;
  }
  if (req.url === "/clean" && req.method === "POST") {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const payload = JSON.parse(Buffer.concat(chunks).toString());
      const original = Buffer.from(payload.file, "base64").toString("utf8");
      const removed = (original.match(ZERO_WIDTH) || []).length;
      const cleaned = original.replace(ZERO_WIDTH, "");
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          kind: "text",
          cleaned: Buffer.from(cleaned, "utf8").toString("base64"),
          report: {
            actions: ["strip_invisible_unicode"],
            removed,
            suspicious: removed > 0,
            fixture: true,
          },
        }),
      );
    });
    return;
  }
  res.writeHead(404).end();
}).listen(PORT, "127.0.0.1", () => {
  console.log(`fake cleaner (fixture, not a real cleaner) on 127.0.0.1:${PORT}`);
});
