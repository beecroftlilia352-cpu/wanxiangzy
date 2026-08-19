/**
 * Production worker supervisor.
 *
 * PostgreSQL owns business state and transactional outboxes; Redis/BullMQ
 * owns generation delivery. OSS transfer, validation and retention cleanup
 * use their own bounded durable queues so slow media I/O never consumes a
 * generation BullMQ slot.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { runGenerationJobById } from "@/lib/api/generation-jobs";
import {
  getAliyunOssRemoteTransferMode,
  validateOssMirrorRuntimeConfig,
} from "@/lib/api/oss-mirror-transfer";
import { getAdminClient } from "@/lib/supabase/admin";
import { parseBullMqConfig } from "@/lib/queue/bullmq-config.server";
import { runGenerationOutboxRelay } from "@/lib/queue/generation-outbox-relay.server";
import { createConfiguredGenerationQueueRuntime } from "@/lib/queue/generation-queue.server";
import { createConfiguredGenerationWorkerRuntime } from "@/lib/queue/generation-worker.server";
import { createWorkerHeartbeat } from "@/lib/queue/worker-heartbeat.server";
import { runOssMirrorRecoveryLoop } from "@/lib/queue/oss-mirror-recovery.server";
import {
  parseMediaValidationConfig,
  runMediaValidationLoop,
} from "@/lib/queue/media-validation-worker.server";
import {
  parseMediaCleanupConfig,
  runMediaAssetCleanupLoop,
} from "@/lib/queue/media-asset-cleanup-worker.server";

const isMainModule = Boolean(process.argv[1])
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

const SHUTDOWN_BUDGET_MS = 30_000;

export type WorkerSupervisorControl = {
  isStopping: () => boolean;
  requestStop: (reason: string, error?: unknown) => void;
  waitForStop: () => Promise<{ reason: string; error?: unknown }>;
};

export function createWorkerSupervisorControl(): WorkerSupervisorControl {
  let stopping = false;
  let resolveStop!: (value: { reason: string; error?: unknown }) => void;
  const stopped = new Promise<{ reason: string; error?: unknown }>((resolvePromise) => {
    resolveStop = resolvePromise;
  });
  return {
    isStopping: () => stopping,
    requestStop(reason, error) {
      if (stopping) return;
      stopping = true;
      emit(error ? "shutdown.fatal" : "shutdown.requested", { reason, error: error ? safeMessage(error) : undefined });
      resolveStop({ reason, error });
    },
    waitForStop: () => stopped,
  };
}

export async function runWorkerSupervisor() {
  loadDotEnvIfPresent();
  validateWorkerRuntimeEnv();
  const bull = parseBullMqConfig(process.env);
  if (!bull.enabled) throw new Error("[worker] production supervisor requires GENERATION_QUEUE_MODE=bullmq");
  if (getAliyunOssRemoteTransferMode() === "disabled") {
    throw new Error("[worker] generated result persistence requires ALIYUN_OSS_REMOTE_TRANSFER_MODE=stream|mirror");
  }
  validateOssMirrorRuntimeConfig();

  const database = getAdminClient();
  const producer = createConfiguredGenerationQueueRuntime(bull);
  const control = createWorkerSupervisorControl();
  const worker = createConfiguredGenerationWorkerRuntime(bull, {
    execute: runGenerationJobById,
    onMetric: (metric) => emit("generation.queue", metric),
  });
  const heartbeat = createWorkerHeartbeat(bull);
  const sleep = createInterruptibleSleep(control);
  const signalHandler = (signal: NodeJS.Signals) => control.requestStop(signal);
  process.once("SIGTERM", signalHandler);
  process.once("SIGINT", signalHandler);

  const relay = supervise("generation.outbox", control, () => runGenerationOutboxRelay({
    database,
    publisher: producer,
    config: bull.relay,
    control,
    sleep,
    onMetric: (metric) => emit("generation.outbox", metric),
  }));
  const mirror = supervise("oss.mirror", control, () => runOssMirrorRecoveryLoop({
    database,
    config: {
      batchSize: intEnv(process.env.OSS_MIRROR_WORKER_BATCH_SIZE, 1, 100, 8),
      pollIntervalMs: intEnv(process.env.OSS_MIRROR_WORKER_POLL_INTERVAL_MS, 100, 30_000, 500),
      staleLeaseSeconds: intEnv(process.env.OSS_MIRROR_STALE_LEASE_SECONDS, 30, 3_600, 480),
    },
    control,
    sleep,
    onMetric: (metric) => emit("oss.mirror", metric),
  }));
  const validation = supervise("media.validation", control, () => runMediaValidationLoop({
    database,
    config: parseMediaValidationConfig(process.env),
    control,
    sleep,
    onMetric: (metric) => emit("media.validation", metric),
  }));
  const cleanup = supervise("media.cleanup", control, () => runMediaAssetCleanupLoop({
    database,
    config: parseMediaCleanupConfig(process.env),
    control,
    sleep,
    onMetric: (metric) => emit("media.cleanup", metric),
  }));

  let shutdownPromise: Promise<void> | undefined;
  const shutdown = () => {
    shutdownPromise ??= shutdownInOrder({
      workerClose: () => worker.close(),
      loops: [relay, mirror, validation, cleanup],
      producerClose: async () => {
        await heartbeat.close();
        await producer.close();
      },
    });
    return shutdownPromise;
  };

  try {
    await worker.start();
    await heartbeat.start();
    emit("supervisor.ready", {
      queue: bull.queueName,
      generationConcurrency: bull.worker.concurrency,
      mirrorMode: getAliyunOssRemoteTransferMode(),
      validationConcurrency: parseMediaValidationConfig(process.env).concurrency,
      cleanupConcurrency: parseMediaCleanupConfig(process.env).concurrency,
    });

    const stop = await control.waitForStop();
    await withTimeout(shutdown(), SHUTDOWN_BUDGET_MS, "worker graceful shutdown exceeded 30 seconds");
    emit("supervisor.stopped", { reason: stop.reason });
    if (stop.error) throw stop.error;
  } catch (error) {
    control.requestStop("supervisor.fatal", error);
    await withTimeout(shutdown(), SHUTDOWN_BUDGET_MS, "worker graceful shutdown exceeded 30 seconds")
      .catch((shutdownError) => emit("shutdown.error", { error: safeMessage(shutdownError) }));
    throw error;
  } finally {
    process.removeListener("SIGTERM", signalHandler);
    process.removeListener("SIGINT", signalHandler);
  }
}

export async function shutdownInOrder(options: {
  workerClose: () => Promise<void>;
  loops: Promise<unknown>[];
  producerClose: () => Promise<void>;
}) {
  try {
    await options.workerClose();
    await Promise.allSettled(options.loops);
  } finally {
    await options.producerClose();
  }
}

function supervise(name: string, control: WorkerSupervisorControl, run: () => Promise<unknown>) {
  return run().catch((error) => {
    control.requestStop(`${name}.fatal`, error);
  });
}

function createInterruptibleSleep(control: WorkerSupervisorControl) {
  return async (ms: number) => {
    const deadline = Date.now() + ms;
    while (!control.isStopping() && Date.now() < deadline) {
      await new Promise((resolveSleep) => setTimeout(resolveSleep, Math.min(250, deadline - Date.now())));
    }
  };
}

export function loadDotEnvIfPresent() {
  for (const filename of [".env.local", ".env.production"]) {
    let content: string;
    try { content = readFileSync(resolve(process.cwd(), filename), "utf8"); } catch { continue; }
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const separator = line.indexOf("=");
      if (separator <= 0) continue;
      const key = line.slice(0, separator).trim();
      if (process.env[key] === undefined) process.env[key] = line.slice(separator + 1).trim();
    }
  }
}

export function validateWorkerRuntimeEnv(env: NodeJS.ProcessEnv = process.env) {
  const required = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "REDIS_URL"];
  const missing = required.filter((name) => !env[name]?.trim());
  if (missing.length) throw new Error(`[worker] missing required env: ${missing.join(", ")}`);
  if (env.NODE_ENV !== "production") {
    throw new Error("[worker] durable supervisor requires NODE_ENV=production");
  }
}

function emit(event: string, fields: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ ts: new Date().toISOString(), service: "worker", event, ...fields }));
}

function safeMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function intEnv(value: string | undefined, min: number, max: number, fallback: number) {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), timeoutMs); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

if (isMainModule) {
  const fatal = (kind: string, error: unknown) => {
    console.error(JSON.stringify({ ts: new Date().toISOString(), service: "worker", event: kind, error: safeMessage(error) }));
    process.exitCode = 1;
  };
  process.on("unhandledRejection", (reason) => {
    fatal("unhandledRejection", reason);
    process.kill(process.pid, "SIGTERM");
  });
  process.on("uncaughtException", (error) => {
    fatal("uncaughtException", error);
    process.kill(process.pid, "SIGTERM");
  });
  runWorkerSupervisor().catch((error) => fatal("fatal", error));
}
