#!/usr/bin/env node

import { randomBytes } from "node:crypto";

import { Queue, Worker } from "bullmq";

const JOB_NAME = "queue.load-test";
const DEFAULTS = Object.freeze({
  jobs: 500,
  workers: 4,
  concurrency: 8,
  workMs: 20,
  delayMs: 750,
  retryDelayMs: 50,
  timeoutMs: 120_000,
  failureJobs: 10,
});

const runId = `${Date.now().toString(36)}-${randomBytes(8).toString("hex")}`;
const queueName = `wanxiangzy-loadtest-${runId}`;
const prefix = `wanxiangzy-loadtest-prefix-${runId}`;

let queue;
/** @type {Worker[]} */
const workers = [];
let finishedNormally = false;
let sensitiveRedisHost = "";

try {
  const config = readConfig(process.env, process.argv.slice(2));
  const redisUrl = validateSafetyGate(process.env);
  sensitiveRedisHost = new URL(redisUrl).hostname;
  const connection = redisConnectionOptions(redisUrl);

  const logicalCompletions = new Map();
  const processorStarts = new Map();
  const startedAtByJob = new Map();
  const completionLatencyMs = [];
  const delayViolations = [];
  const duplicateJobId = `job-${runId}-${config.jobs - 1}`;
  let active = 0;
  let peakActive = 0;
  let transientFailures = 0;

  queue = new Queue(queueName, {
    prefix,
    connection,
    defaultJobOptions: {
      removeOnComplete: false,
      removeOnFail: false,
    },
  });
  await withTimeout(queue.waitUntilReady(), 10_000, "Redis/BullMQ readiness");

  const testStartedAt = Date.now();
  const delayedJobs = Math.min(config.jobs, Math.max(1, Math.floor(config.jobs * 0.05)));
  const failureJobs = Math.min(config.failureJobs, Math.max(0, config.jobs - 1));
  const bulk = Array.from({ length: config.jobs }, (_, index) => {
    const jobId = `job-${runId}-${index}`;
    const delayed = index < delayedJobs;
    const enqueuedAtMs = Date.now();
    const notBeforeMs = delayed ? enqueuedAtMs + config.delayMs : enqueuedAtMs;
    return {
      name: JOB_NAME,
      data: {
        logicalId: jobId,
        enqueuedAtMs,
        notBeforeMs,
        failOnce: index < failureJobs,
      },
      opts: {
        jobId,
        delay: delayed ? config.delayMs : 0,
        attempts: 3,
        backoff: { type: "fixed", delay: config.retryDelayMs },
        removeOnComplete: false,
        removeOnFail: false,
      },
    };
  });

  await queue.addBulk(bulk);
  const duplicateBefore = await queue.getJob(duplicateJobId);
  await queue.add(
    JOB_NAME,
    {
      logicalId: duplicateJobId,
      enqueuedAtMs: testStartedAt,
      notBeforeMs: testStartedAt,
      failOnce: false,
    },
    { jobId: duplicateJobId },
  );
  const duplicateAfter = await queue.getJob(duplicateJobId);
  assert(
    duplicateBefore?.id === duplicateAfter?.id,
    "duplicate jobId did not resolve to the existing BullMQ job",
  );

  const processor = async (job) => {
    const data = job.data;
    const logicalId = String(data.logicalId || "");
    assert(logicalId, "worker received a job without logicalId");

    active += 1;
    peakActive = Math.max(peakActive, active);
    processorStarts.set(logicalId, (processorStarts.get(logicalId) ?? 0) + 1);
    startedAtByJob.set(logicalId, startedAtByJob.get(logicalId) ?? Date.now());

    try {
      if (Date.now() + 25 < Number(data.notBeforeMs)) {
        delayViolations.push({ logicalId, earlyByMs: Number(data.notBeforeMs) - Date.now() });
      }

      await sleep(config.workMs);

      if (data.failOnce === true && job.attemptsMade === 0) {
        transientFailures += 1;
        throw new Error("intentional first-attempt load-test failure");
      }

      const completionCount = (logicalCompletions.get(logicalId) ?? 0) + 1;
      logicalCompletions.set(logicalId, completionCount);
      completionLatencyMs.push(Date.now() - Number(data.enqueuedAtMs));
      assert(completionCount === 1, `logical job completed more than once: ${logicalId}`);
      return { logicalId, completionCount };
    } finally {
      active -= 1;
    }
  };

  for (let index = 0; index < config.workers; index += 1) {
    const worker = new Worker(queueName, processor, {
      prefix,
      connection,
      concurrency: config.concurrency,
      lockDuration: 30_000,
      lockRenewTime: 10_000,
      stalledInterval: 10_000,
      maxStalledCount: 2,
      autorun: false,
    });
    worker.on("error", (error) => {
      process.stderr.write(`[queue-load-test] worker error: ${safeMessage(error)}\n`);
    });
    workers.push(worker);
  }

  await Promise.all(workers.map((worker) => worker.waitUntilReady()));
  for (const worker of workers) void worker.run();

  await waitForCompletion({
    queue,
    expected: config.jobs,
    completions: logicalCompletions,
    timeoutMs: config.timeoutMs,
  });

  await Promise.all(workers.map((worker) => worker.close()));
  workers.length = 0;

  const waiting = await queue.getWaitingCount();
  const activeCount = await queue.getActiveCount();
  const delayed = await queue.getDelayedCount();
  const terminalFailed = await queue.getFailedCount();
  const completed = await queue.getCompletedCount();
  const elapsedMs = Date.now() - testStartedAt;
  const peakLimit = config.workers * config.concurrency;
  const duplicateStarts = processorStarts.get(duplicateJobId) ?? 0;
  const retriedFailures = bulk
    .slice(0, failureJobs)
    .filter(({ data }) => (processorStarts.get(data.logicalId) ?? 0) >= 2)
    .length;

  assert(peakActive <= peakLimit, `peak concurrency ${peakActive} exceeded ${peakLimit}`);
  assert(peakActive > 0, "no job reached active state");
  assert(logicalCompletions.size === config.jobs, "not every logical job completed");
  assert(
    [...logicalCompletions.values()].every((count) => count === 1),
    "at least one logical job completed more than once",
  );
  assert(duplicateStarts === 1, `duplicate jobId executed ${duplicateStarts} times`);
  assert(delayViolations.length === 0, `${delayViolations.length} delayed jobs ran early`);
  assert(transientFailures === failureJobs, "intentional failures did not all execute");
  assert(retriedFailures === failureJobs, "intentional failures were not all retried");
  assert(waiting === 0, `waiting leak: ${waiting}`);
  assert(activeCount === 0, `active leak: ${activeCount}`);
  assert(delayed === 0, `delayed leak: ${delayed}`);
  assert(terminalFailed === 0, `terminal failures: ${terminalFailed}`);
  assert(completed === config.jobs, `completed Redis jobs ${completed} != ${config.jobs}`);

  const report = {
    ok: true,
    isolated: { queueName, prefix },
    config,
    results: {
      jobs: config.jobs,
      completedLogicalJobs: logicalCompletions.size,
      completedRedisJobs: completed,
      transientFailures,
      terminalFailures: terminalFailed,
      retriedFailures,
      duplicateJobIdDeduplicated: duplicateStarts === 1,
      delayedJobs,
      peakConcurrency: peakActive,
      peakConcurrencyLimit: peakLimit,
      elapsedMs,
      throughputJobsPerSecond: round(config.jobs / (elapsedMs / 1000)),
      latencyMs: {
        p50: percentile(completionLatencyMs, 0.5),
        p95: percentile(completionLatencyMs, 0.95),
        p99: percentile(completionLatencyMs, 0.99),
      },
      leaks: { waiting, active: activeCount, delayed },
    },
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  finishedNormally = true;
} catch (error) {
  process.stderr.write(`[queue-load-test] FAILED: ${safeMessage(error)}\n`);
  process.exitCode = 1;
} finally {
  await Promise.allSettled(workers.map((worker) => worker.close(true)));
  if (queue) {
    try {
      // Queue#obliterate is scoped to this exact random prefix + queue name.
      // Never SCAN, FLUSHDB, FLUSHALL, or delete user-supplied key patterns.
      await queue.obliterate({ force: true });
    } catch (error) {
      process.stderr.write(`[queue-load-test] isolated cleanup failed: ${safeMessage(error)}\n`);
      process.exitCode = 1;
    } finally {
      await queue.close().catch(() => undefined);
    }
  }
  if (finishedNormally) {
    process.stdout.write(`[queue-load-test] cleaned isolated queue ${queueName}\n`);
  }
}

export function validateSafetyGate(env) {
  if (env.ALLOW_QUEUE_LOAD_TEST !== "1") {
    throw new Error("set ALLOW_QUEUE_LOAD_TEST=1 to authorize the isolated queue load test");
  }
  const raw = String(env.LOAD_TEST_REDIS_URL || "").trim();
  if (!raw) throw new Error("LOAD_TEST_REDIS_URL is required; REDIS_URL is never used as fallback");

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("LOAD_TEST_REDIS_URL must be a valid redis:// or rediss:// URL");
  }
  if (!['redis:', 'rediss:'].includes(url.protocol)) {
    throw new Error("LOAD_TEST_REDIS_URL must use redis:// or rediss://");
  }

  const host = url.hostname.toLowerCase();
  if (!host) throw new Error("LOAD_TEST_REDIS_URL must include a host");
  if (/(^|[.\-_])(prod|production|live|primary|master)([.\-_]|$)/i.test(host)) {
    throw new Error("refusing a Redis host whose name looks like production");
  }
  for (const marker of [env.NODE_ENV, env.VERCEL_ENV, env.DEPLOYMENT_ENV, env.APP_ENV]) {
    if (String(marker || "").toLowerCase() === "production") {
      throw new Error("refusing to run while an environment marker is production");
    }
  }
  if (env.REDIS_URL && normalizeRedisUrl(env.REDIS_URL) === normalizeRedisUrl(raw)) {
    throw new Error("LOAD_TEST_REDIS_URL must not equal the application REDIS_URL");
  }
  return raw;
}

export function readConfig(env, args) {
  const flags = parseFlags(args);
  const jobs = boundedInt(flags.jobs ?? env.LOAD_TEST_JOBS, DEFAULTS.jobs, 2, 1_000_000, "jobs");
  return {
    jobs,
    workers: boundedInt(flags.workers ?? env.LOAD_TEST_WORKERS, DEFAULTS.workers, 1, 64, "workers"),
    concurrency: boundedInt(
      flags.concurrency ?? env.LOAD_TEST_CONCURRENCY,
      DEFAULTS.concurrency,
      1,
      512,
      "concurrency",
    ),
    workMs: boundedInt(flags["work-ms"] ?? env.LOAD_TEST_WORK_MS, DEFAULTS.workMs, 0, 60_000, "work-ms"),
    delayMs: boundedInt(flags["delay-ms"] ?? env.LOAD_TEST_DELAY_MS, DEFAULTS.delayMs, 50, 300_000, "delay-ms"),
    retryDelayMs: boundedInt(
      flags["retry-delay-ms"] ?? env.LOAD_TEST_RETRY_DELAY_MS,
      DEFAULTS.retryDelayMs,
      1,
      60_000,
      "retry-delay-ms",
    ),
    timeoutMs: boundedInt(
      flags["timeout-ms"] ?? env.LOAD_TEST_TIMEOUT_MS,
      DEFAULTS.timeoutMs,
      1_000,
      3_600_000,
      "timeout-ms",
    ),
    failureJobs: boundedInt(
      flags["failure-jobs"] ?? env.LOAD_TEST_FAILURE_JOBS,
      Math.min(DEFAULTS.failureJobs, jobs - 1),
      0,
      jobs - 1,
      "failure-jobs",
    ),
  };
}

function redisConnectionOptions(raw) {
  const url = new URL(raw);
  const pathDb = url.pathname && url.pathname !== "/" ? Number(url.pathname.slice(1)) : 0;
  if (!Number.isInteger(pathDb) || pathDb < 0) {
    throw new Error("LOAD_TEST_REDIS_URL database path must be a non-negative integer");
  }
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: pathDb,
    tls: url.protocol === "rediss:" ? {} : undefined,
    connectTimeout: 5_000,
    commandTimeout: 10_000,
    maxRetriesPerRequest: null,
    retryStrategy: (attempt) => (attempt <= 2 ? Math.min(attempt * 100, 500) : null),
  };
}

async function waitForCompletion({ queue: targetQueue, expected, completions, timeoutMs }) {
  const deadline = Date.now() + timeoutMs;
  while (completions.size < expected) {
    if (Date.now() >= deadline) {
      const counts = await targetQueue.getJobCounts("wait", "active", "delayed", "failed", "completed");
      throw new Error(`timeout waiting for jobs; completed=${completions.size}/${expected}; counts=${JSON.stringify(counts)}`);
    }
    if (await targetQueue.getFailedCount() > 0) {
      throw new Error("a job reached terminal failed state before the run completed");
    }
    await sleep(50);
  }
}

function parseFlags(args) {
  const flags = {};
  const allowed = new Set([
    "jobs",
    "workers",
    "concurrency",
    "work-ms",
    "delay-ms",
    "retry-delay-ms",
    "timeout-ms",
    "failure-jobs",
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) throw new Error(`unexpected argument: ${arg}`);
    const [rawKey, inline] = arg.slice(2).split("=", 2);
    if (!rawKey) throw new Error("empty flag name");
    if (!allowed.has(rawKey)) throw new Error(`unknown flag: --${rawKey}`);
    const value = inline ?? args[++index];
    if (value === undefined || value.startsWith("--")) throw new Error(`missing value for --${rawKey}`);
    flags[rawKey] = value;
  }
  return flags;
}

function boundedInt(value, fallback, min, max, name) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

function percentile(values, quantile) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(quantile * sorted.length) - 1));
  return sorted[index];
}

function normalizeRedisUrl(raw) {
  try {
    const url = new URL(String(raw).trim());
    return `${url.protocol}//${url.hostname.toLowerCase()}:${url.port || "6379"}${url.pathname || "/0"}`;
  } catch {
    return "invalid";
  }
}

function safeMessage(error) {
  const message = error instanceof Error ? error.message : String(error);
  const withoutUrl = message
    .replace(/rediss?:\/\/[^\s]+/gi, "[redis-url-redacted]")
    .replace(/password=[^\s,;]+/gi, "password=[redacted]");
  if (!sensitiveRedisHost) return withoutUrl;
  return withoutUrl.replaceAll(sensitiveRedisHost, "[redis-host-redacted]");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, timeoutMs, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
      timer.unref?.();
    }),
  ]);
}
