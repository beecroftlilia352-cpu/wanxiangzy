#!/usr/bin/env node

import { chmod, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const envPath = await realpath(resolve(process.argv[2] || ".env.production"));
const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!supabaseUrl || !serviceKey) fail("missing Supabase service configuration");

const query = new URL(`${supabaseUrl}/rest/v1/admin_config_versions`);
query.searchParams.set("select", "value,published_at");
query.searchParams.set("config_key", "eq.worker.runtime.v1");
query.searchParams.set("status", "eq.published");
query.searchParams.set("order", "created_at.desc");
query.searchParams.set("limit", "1");

let response;
try {
  response = await fetch(query, {
    headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
    signal: AbortSignal.timeout(10_000),
  });
} catch {
  fail("Worker runtime config endpoint is unreachable");
}
if (!response.ok) fail(`Worker runtime config request failed (${response.status})`);
const rows = await response.json();
const value = Array.isArray(rows) && rows.length > 0 ? rows[0]?.value || {} : {};
const desiredInstances = integer(firstDefined(
  process.env.DEPLOY_WORKER_INSTANCES,
  value?.desiredInstances,
  process.env.PM2_WORKER_INSTANCES,
  1,
), 1, 32, "desiredInstances");
const workerConcurrency = integer(firstDefined(
  process.env.DEPLOY_WORKER_CONCURRENCY,
  value?.workerConcurrency,
  process.env.BULLMQ_WORKER_CONCURRENCY,
  64,
), 1, 64, "workerConcurrency");
const imageBatchConcurrency = integer(firstDefined(
  process.env.DEPLOY_IMAGE_BATCH_CONCURRENCY,
  value?.imageBatchConcurrency,
  process.env.GENERATION_IMAGE_BATCH_CONCURRENCY,
  16,
), 1, 24, "imageBatchConcurrency");
const relayConcurrency = integer(firstDefined(
  value?.relayConcurrency,
  process.env.BULLMQ_RELAY_CONCURRENCY,
  8,
), 1, 128, "relayConcurrency");
const original = await readFile(envPath, "utf8");
const updated = setEnv(setEnv(setEnv(setEnv(original,
  "PM2_WORKER_INSTANCES", String(desiredInstances)),
"BULLMQ_WORKER_CONCURRENCY", String(workerConcurrency)),
"GENERATION_IMAGE_BATCH_CONCURRENCY", String(imageBatchConcurrency)),
"BULLMQ_RELAY_CONCURRENCY", String(relayConcurrency));
const temporary = `${envPath}.worker-runtime.${process.pid}.tmp`;
await writeFile(temporary, updated, { encoding: "utf8", mode: 0o600 });
await chmod(temporary, 0o600);
await rename(temporary, envPath);
console.log(`Worker runtime config applied (instances=${desiredInstances}, worker=${workerConcurrency}, imageBatch=${imageBatchConcurrency}, relay=${relayConcurrency}).`);

function integer(input, minimum, maximum, name) {
  const parsed = Number(input);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    fail(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return parsed;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");
}

function setEnv(content, key, value) {
  const lines = content.split(/\r?\n/).filter((line) => !line.startsWith(`${key}=`));
  lines.push(`${key}=${value}`);
  return `${lines.filter((line, lineIndex) => lineIndex < lines.length - 1 || line).join("\n")}\n`;
}

function fail(message) {
  console.error(`Worker runtime config: ${message}.`);
  process.exit(1);
}
