/**
 * Pre-import env loader for `scripts/worker.ts`.
 *
 * `lib/env.ts` runs `validateEnvOnce()` at module load time, which prints a
 * `[env] NEXT_PUBLIC_* is not set` warning before `loadDotEnvIfPresent()`
 * inside `bootstrap()` has had a chance to read `.env.production`.
 *
 * Loading env BEFORE any TS module is evaluated eliminates that warning.
 * `--require ./scripts/worker-bootstrap.cjs` (passed via tsx) ensures this
 * file runs first, before scripts/worker.ts and its transitive imports
 * (`lib/api/generation-jobs`, `lib/env.ts`, etc.).
 *
 * Compatible with Node 20+. Does NOT use `--env-file-if-exists` because that
 * flag was added in Node 22.7 and EC2 still runs Node 20.20.2.
 */

"use strict";

const { existsSync, readFileSync } = require("node:fs");
const { resolve } = require("node:path");

function loadDotEnv(filename) {
  const filepath = resolve(process.cwd(), filename);
  if (!existsSync(filepath)) return;
  const content = readFileSync(filepath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

// Order matches `loadDotEnvIfPresent()` in scripts/worker.ts:
// .env.local first (developer overrides), then .env.production as fallback.
loadDotEnv(".env.local");
loadDotEnv(".env.production");
