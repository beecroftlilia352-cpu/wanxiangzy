import {
  QueueEvents,
  UnrecoverableError,
  Worker,
  type ConnectionOptions,
  type Job,
  type QueueEventsOptions,
  type WorkerOptions,
} from "bullmq";

import {
  GENERATION_QUEUE_JOB_NAME,
  type GenerationQueuePayload,
} from "@/lib/queue/generation-queue.server";
import type { BullMqRuntimeConfig } from "@/lib/queue/bullmq-config.server";
import {
  AGED_STANDARD_GENERATION_PRIORITY,
  isGenerationQueuePriority,
  STANDARD_GENERATION_PRIORITY,
  VIP_GENERATION_PRIORITY,
} from "@/lib/queue/generation-priorities";

export type GenerationExecutionSummary = {
  processed?: number;
  deferred?: number;
  skipped?: number;
  failed?: number;
};

export type GenerationWorkerOutcome = "completed" | "business-failed" | "deferred" | "skipped";

export type GenerationWorkerResult = {
  outcome: GenerationWorkerOutcome;
  generationId: string;
  deliveryVersion: number;
  deliveryKey: string;
};

export type GenerationQueueMetricEvent = {
  event:
    | "added"
    | "active"
    | "completed"
    | "failed"
    | "delayed"
    | "duplicated"
    | "stalled"
    | "worker.error"
    | "queue-events.error";
  timestamp: string;
  queueName: string;
  jobId?: string;
  outcome?: GenerationWorkerOutcome;
  reason?: string;
};

type QueueJob = Pick<Job<GenerationQueuePayload>, "id" | "name" | "data">;
export type GenerationProcessor = (job: QueueJob) => Promise<GenerationWorkerResult>;

export interface GenerationWorkerLike {
  on(event: string, listener: (...args: never[]) => void): GenerationWorkerLike;
  close(): Promise<void>;
  run?(): Promise<void>;
  waitUntilReady?(): Promise<unknown>;
}

export interface GenerationQueueEventsLike {
  on(event: string, listener: (...args: never[]) => void): GenerationQueueEventsLike;
  close(): Promise<void>;
  waitUntilReady?(): Promise<unknown>;
}

export type GenerationWorkerFactory = (
  name: string,
  processor: GenerationProcessor,
  options: WorkerOptions,
) => GenerationWorkerLike;

export type GenerationQueueEventsFactory = (
  name: string,
  options: QueueEventsOptions,
) => GenerationQueueEventsLike;

export function createGenerationWorkerRuntime(options: {
  queueName: string;
  prefix?: string;
  connection?: ConnectionOptions;
  workerConnection?: ConnectionOptions;
  queueEventsConnection?: ConnectionOptions;
  concurrency?: number;
  execute: (generationId: string, deliveryVersion: number) => Promise<GenerationExecutionSummary>;
  workerFactory?: GenerationWorkerFactory;
  queueEventsFactory?: GenerationQueueEventsFactory;
  onMetric?: (metric: GenerationQueueMetricEvent) => void;
  now?: () => Date;
  lockDurationMs?: number;
  lockRenewTimeMs?: number;
  stalledIntervalMs?: number;
  maxStalledCount?: number;
}) {
  if (!options.queueName.trim()) throw new Error("[generation-worker] queueName is required");
  const workerConnection = options.workerConnection ?? options.connection;
  const queueEventsConnection = options.queueEventsConnection ?? options.connection;
  if ((!workerConnection && !options.workerFactory)
    || (!queueEventsConnection && !options.queueEventsFactory)) {
    throw new Error(
      "[generation-worker] connection or both workerFactory and queueEventsFactory are required",
    );
  }

  const queueName = options.queueName.trim();
  const processor = createGenerationProcessor(options.execute);
  const workerOptions: WorkerOptions = {
    connection: workerConnection ?? ({} as ConnectionOptions),
    prefix: options.prefix,
    autorun: false,
    concurrency: clampInteger(options.concurrency ?? 4, 1, 64),
    lockDuration: options.lockDurationMs ?? 120_000,
    lockRenewTime: options.lockRenewTimeMs ?? 30_000,
    stalledInterval: options.stalledIntervalMs ?? 30_000,
    maxStalledCount: options.maxStalledCount ?? 2,
    metrics: { maxDataPoints: 24 * 60 },
  };
  const queueEventsOptions: QueueEventsOptions = {
    connection: queueEventsConnection ?? ({} as ConnectionOptions),
    prefix: options.prefix,
  };

  const workerFactory = options.workerFactory ?? defaultWorkerFactory;
  const queueEventsFactory = options.queueEventsFactory ?? defaultQueueEventsFactory;
  // Start the observer first. Worker autorun is disabled so the events stream
  // can be ready before the first delivery transitions to active/completed.
  const queueEvents = queueEventsFactory(queueName, queueEventsOptions);
  const emit = createMetricEmitter(queueName, options.onMetric, options.now);
  bindQueueEvents(queueEvents, emit);
  const worker = workerFactory(queueName, processor, workerOptions);
  worker.on("error", ((error: Error) => {
    emit({ event: "worker.error", reason: error.message });
  }) as (...args: never[]) => void);

  let closePromise: Promise<void> | undefined;
  let startPromise: Promise<void> | undefined;
  let closing = false;
  const start = () => {
    startPromise ??= (async () => {
      await queueEvents.waitUntilReady?.();
      if (closing) return;
      if (worker.run) {
        void worker.run().catch((error: unknown) => {
          emit({
            event: "worker.error",
            reason: error instanceof Error ? error.message : String(error),
          });
        });
      }
      await worker.waitUntilReady?.();
    })();
    return startPromise;
  };
  return {
    worker,
    queueEvents,
    processor,

    start,
    waitUntilReady: start,

    close(): Promise<void> {
      closing = true;
      closePromise ??= (async () => {
        // Worker first: stop claiming and drain active processors. QueueEvents
        // stays alive during that drain so terminal transitions remain visible.
        try {
          await worker.close();
        } finally {
          await queueEvents.close();
        }
      })();
      return closePromise;
    },
  };
}

export function createConfiguredGenerationWorkerRuntime(
  config: BullMqRuntimeConfig,
  options: {
    execute: (generationId: string, deliveryVersion: number) => Promise<GenerationExecutionSummary>;
    workerFactory?: GenerationWorkerFactory;
    queueEventsFactory?: GenerationQueueEventsFactory;
    onMetric?: (metric: GenerationQueueMetricEvent) => void;
    now?: () => Date;
  },
) {
  if (!config.connections && (!options.workerFactory || !options.queueEventsFactory)) {
    throw new Error("[generation-worker] BullMQ is not configured");
  }
  return createGenerationWorkerRuntime({
    queueName: config.queueName,
    prefix: config.prefix,
    workerConnection: config.connections?.worker as ConnectionOptions | undefined,
    queueEventsConnection: config.connections?.observer as ConnectionOptions | undefined,
    concurrency: config.worker.concurrency,
    lockDurationMs: config.worker.lockDurationMs,
    lockRenewTimeMs: config.worker.lockRenewTimeMs,
    stalledIntervalMs: config.worker.stalledIntervalMs,
    maxStalledCount: config.worker.maxStalledCount,
    execute: options.execute,
    workerFactory: options.workerFactory,
    queueEventsFactory: options.queueEventsFactory,
    onMetric: options.onMetric,
    now: options.now,
  });
}

export function createGenerationProcessor(
  execute: (generationId: string, deliveryVersion: number) => Promise<GenerationExecutionSummary>,
): GenerationProcessor {
  return async (job) => {
    try {
      const payload = normalizeGenerationQueuePayload(job.data);
      if (job.name !== GENERATION_QUEUE_JOB_NAME) {
        throw new Error(`[generation-worker] unsupported job name: ${job.name}`);
      }
      if (job.id !== payload.deliveryKey) {
        throw new Error("[generation-worker] BullMQ job id does not match the delivery fence");
      }
    } catch (error) {
      // Payload/name/fence violations are poison messages, not transient
      // infrastructure failures. Stop retrying them immediately.
      throw new UnrecoverableError(error instanceof Error ? error.message : String(error));
    }

    const payload = normalizeGenerationQueuePayload(job.data);
    const summary = await execute(payload.generationId, payload.deliveryVersion);
    const outcome: GenerationWorkerOutcome = Number(summary.deferred || 0) > 0
      ? "deferred"
      : Number(summary.failed || 0) > 0
        ? "business-failed"
      : Number(summary.processed || 0) > 0
        ? "completed"
        : "skipped";

    // `deferred` intentionally returns normally. Provider capacity backpressure
    // is persisted in Postgres and the relay publishes the next delivery; it is
    // not a BullMQ failure/retry attempt.
    return {
      outcome,
      generationId: payload.generationId,
      deliveryVersion: payload.deliveryVersion,
      deliveryKey: payload.deliveryKey,
    };
  };
}

function normalizeGenerationQueuePayload(payload: GenerationQueuePayload): GenerationQueuePayload {
  if (!payload || payload.schemaVersion !== 1) {
    throw new Error("[generation-worker] unsupported generation payload schema");
  }
  if (typeof payload.generationId !== "string" || !payload.generationId.trim()) {
    throw new Error("[generation-worker] generationId is required");
  }
  if (!Number.isInteger(payload.deliveryVersion) || payload.deliveryVersion < 1) {
    throw new Error("[generation-worker] deliveryVersion must be a positive integer");
  }
  if (typeof payload.deliveryKey !== "string" || !payload.deliveryKey.trim()) {
    throw new Error("[generation-worker] deliveryKey is required");
  }
  if (!/^[A-Za-z0-9_-]{20,160}$/.test(payload.deliveryKey)) {
    throw new Error("[generation-worker] deliveryKey is not a portable BullMQ job id");
  }
  if (typeof payload.availableAt !== "string" || !Number.isFinite(Date.parse(payload.availableAt))) {
    throw new Error("[generation-worker] availableAt must be a valid date");
  }
  const serviceTier = payload.serviceTier === undefined ? "standard" : payload.serviceTier;
  const queuePriority = payload.queuePriority === undefined ? 20 : payload.queuePriority;
  if (serviceTier !== "standard" && serviceTier !== "vip") {
    throw new Error("[generation-worker] serviceTier must be standard or vip");
  }
  if (!isGenerationQueuePriority(queuePriority)) {
    throw new Error("[generation-worker] queuePriority must be 2, 5 or 20");
  }
  if ((serviceTier === "vip" && queuePriority !== VIP_GENERATION_PRIORITY)
    || (serviceTier === "standard"
      && queuePriority !== STANDARD_GENERATION_PRIORITY
      && queuePriority !== AGED_STANDARD_GENERATION_PRIORITY)) {
    throw new Error("[generation-worker] service tier and queue priority conflict");
  }
  return { ...payload, serviceTier, queuePriority };
}

function bindQueueEvents(
  queueEvents: GenerationQueueEventsLike,
  emit: (metric: Omit<GenerationQueueMetricEvent, "timestamp" | "queueName">) => void,
) {
  queueEvents.on("added", ((args: { jobId: string }) => emit({ event: "added", jobId: args.jobId })) as (...args: never[]) => void);
  queueEvents.on("active", ((args: { jobId: string }) => emit({ event: "active", jobId: args.jobId })) as (...args: never[]) => void);
  queueEvents.on("completed", ((args: { jobId: string; returnvalue?: GenerationWorkerResult }) => emit({
    event: "completed",
    jobId: args.jobId,
    outcome: args.returnvalue?.outcome,
  })) as (...args: never[]) => void);
  queueEvents.on("failed", ((args: { jobId: string; failedReason: string }) => emit({
    event: "failed",
    jobId: args.jobId,
    reason: args.failedReason,
  })) as (...args: never[]) => void);
  queueEvents.on("delayed", ((args: { jobId: string }) => emit({ event: "delayed", jobId: args.jobId })) as (...args: never[]) => void);
  queueEvents.on("duplicated", ((args: { jobId: string }) => emit({ event: "duplicated", jobId: args.jobId })) as (...args: never[]) => void);
  queueEvents.on("stalled", ((args: { jobId: string }) => emit({ event: "stalled", jobId: args.jobId })) as (...args: never[]) => void);
  queueEvents.on("error", ((error: Error) => emit({
    event: "queue-events.error",
    reason: error.message,
  })) as (...args: never[]) => void);
}

function createMetricEmitter(
  queueName: string,
  onMetric: ((metric: GenerationQueueMetricEvent) => void) | undefined,
  now: (() => Date) | undefined,
) {
  const clock = now ?? (() => new Date());
  return (metric: Omit<GenerationQueueMetricEvent, "timestamp" | "queueName">) => {
    onMetric?.({ ...metric, queueName, timestamp: clock().toISOString() });
  };
}

function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(Math.floor(value), min), max);
}

const defaultWorkerFactory: GenerationWorkerFactory = (name, processor, options) => (
  new Worker<GenerationQueuePayload, GenerationWorkerResult, typeof GENERATION_QUEUE_JOB_NAME>(
    name,
    processor,
    options,
  ) as unknown as GenerationWorkerLike
);

const defaultQueueEventsFactory: GenerationQueueEventsFactory = (name, options) => (
  new QueueEvents<GenerationWorkerResult>(name, options) as unknown as GenerationQueueEventsLike
);
