import {
  Queue,
  type ConnectionOptions,
  type JobsOptions,
  type QueueOptions,
} from "bullmq";

import type { BullMqRuntimeConfig } from "@/lib/queue/bullmq-config.server";
import type { GenerationQueuePriority } from "@/lib/queue/generation-priorities";

export const GENERATION_QUEUE_JOB_NAME = "generation.execute" as const;

export type GenerationQueuePayload = {
  schemaVersion: 1;
  generationId: string;
  deliveryVersion: number;
  deliveryKey: string;
  availableAt: string;
  serviceTier: "standard" | "vip";
  queuePriority: GenerationQueuePriority;
};

export type GenerationQueueAddOptions = Pick<
  JobsOptions,
  "jobId" | "delay" | "attempts" | "backoff" | "priority" | "removeOnComplete" | "removeOnFail"
>;

export type PrioritizedGenerationJob = {
  data: GenerationQueuePayload;
  timestamp: number;
  opts: { priority?: number };
  changePriority(options: { priority: number }): Promise<void>;
};

export interface GenerationQueueLike {
  add(
    name: typeof GENERATION_QUEUE_JOB_NAME,
    payload: GenerationQueuePayload,
    options: GenerationQueueAddOptions,
  ): Promise<{ id?: string } | undefined>;
  getJob?(jobId: string): Promise<{
    getState(): Promise<string>;
    remove(): Promise<void>;
  } | undefined>;
  getPrioritized?(start?: number, end?: number): Promise<PrioritizedGenerationJob[]>;
  getCountsPerPriority?(priorities: number[]): Promise<Record<string, number>>;
  close(): Promise<void>;
}

export type GenerationQueueFactory = (
  name: string,
  options: QueueOptions,
) => GenerationQueueLike;

export type EnqueueGenerationDeliveryInput = {
  generationId: string;
  deliveryVersion: number;
  deliveryKey: string;
  availableAt: string | number | Date;
  serviceTier: "standard" | "vip";
  queuePriority: GenerationQueuePriority;
};

export type EnqueueGenerationDeliveryResult = {
  jobId: string;
  delayMs: number;
  payload: GenerationQueuePayload;
};

const DEFAULT_COMPLETED_RETENTION = Object.freeze({ age: 60 * 60, count: 10_000 });
const DEFAULT_FAILED_RETENTION = Object.freeze({ age: 7 * 24 * 60 * 60, count: 50_000 });

type GenerationQueueRetention = {
  completed: { age: number; count: number };
  failed: { age: number; count: number };
};

type GenerationQueueRetry = {
  attempts: number;
  backoffMs: number;
};

const DEFAULT_RETRY = Object.freeze({ attempts: 3, backoffMs: 5_000 });

/**
 * A small producer runtime. The Postgres generation row remains the durable
 * source of truth; this queue contains only delivery notifications.
 */
export function createGenerationQueueRuntime(options: {
  queueName: string;
  prefix?: string;
  connection?: ConnectionOptions;
  queue?: GenerationQueueLike;
  queueFactory?: GenerationQueueFactory;
  now?: () => number;
  retention?: GenerationQueueRetention;
  retry?: GenerationQueueRetry;
}) {
  const queue = options.queue ?? createQueue(options);
  const now = options.now ?? Date.now;
  const retention = options.retention ?? {
    completed: DEFAULT_COMPLETED_RETENTION,
    failed: DEFAULT_FAILED_RETENTION,
  };
  const retry = options.retry ?? DEFAULT_RETRY;
  let closePromise: Promise<void> | undefined;

  return {
    queue,

    async enqueue(input: EnqueueGenerationDeliveryInput): Promise<EnqueueGenerationDeliveryResult> {
      const payload = createGenerationQueuePayload(input);
      const jobId = createGenerationDeliveryJobId(
        payload.generationId,
        payload.deliveryVersion,
        payload.deliveryKey,
      );
      const delayMs = Math.max(0, Date.parse(payload.availableAt) - now());

      // A previously exhausted infrastructure delivery remains in BullMQ's
      // failed set for diagnostics. PostgreSQL recovery only republishes while
      // the generation is still queued, so removing that exact failed job is
      // a safe, deterministic redrive and avoids duplicate-id suppression.
      const existing = await queue.getJob?.(jobId);
      if (existing && await existing.getState() === "failed") {
        await existing.remove();
      }

      // BullMQ ignores an add whose jobId already exists in this queue. The
      // deterministic delivery-scoped id therefore makes producer retries and
      // the Postgres reconciliation relay idempotent.
      await queue.add(GENERATION_QUEUE_JOB_NAME, payload, {
        jobId,
        delay: delayMs,
        attempts: retry.attempts,
        backoff: { type: "exponential", delay: retry.backoffMs, jitter: 0.5 },
        priority: payload.queuePriority,
        removeOnComplete: retention.completed,
        removeOnFail: retention.failed,
      });

      return { jobId, delayMs, payload };
    },

    close(): Promise<void> {
      closePromise ??= queue.close();
      return closePromise;
    },
  };
}

export function createConfiguredGenerationQueueRuntime(
  config: BullMqRuntimeConfig,
  injection: {
    queue?: GenerationQueueLike;
    queueFactory?: GenerationQueueFactory;
    now?: () => number;
  } = {},
) {
  if (!config.connections && !injection.queue) {
    throw new Error("[generation-queue] BullMQ is not configured");
  }
  return createGenerationQueueRuntime({
    queueName: config.queueName,
    prefix: config.prefix,
    connection: config.connections?.producer as ConnectionOptions | undefined,
    queue: injection.queue,
    queueFactory: injection.queueFactory,
    now: injection.now,
    retention: {
      completed: {
        age: config.retention.completedAgeSeconds,
        count: config.retention.completedCount,
      },
      failed: {
        age: config.retention.failedAgeSeconds,
        count: config.retention.failedCount,
      },
    },
    retry: config.jobs,
  });
}

export function createGenerationQueuePayload(
  input: EnqueueGenerationDeliveryInput,
): GenerationQueuePayload {
  const generationId = input.generationId.trim();
  const deliveryKey = input.deliveryKey.trim();
  if (!generationId) throw new Error("[generation-queue] generationId is required");
  if (!deliveryKey) throw new Error("[generation-queue] deliveryKey is required");
  if (!Number.isInteger(input.deliveryVersion) || input.deliveryVersion < 1) {
    throw new Error("[generation-queue] deliveryVersion must be a positive integer");
  }
  if (input.serviceTier !== "standard" && input.serviceTier !== "vip") {
    throw new Error("[generation-queue] serviceTier must be standard or vip");
  }
  if (input.queuePriority !== 2 && input.queuePriority !== 5 && input.queuePriority !== 20) {
    throw new Error("[generation-queue] queuePriority must be 2, 5 or 20");
  }

  const availableAtDate = input.availableAt instanceof Date
    ? input.availableAt
    : new Date(input.availableAt);
  if (!Number.isFinite(availableAtDate.getTime())) {
    throw new Error("[generation-queue] availableAt must be a valid date");
  }

  // Keep this object intentionally minimal. Business payload, credits and
  // provider inputs are loaded from Postgres only after the worker claims it.
  return {
    schemaVersion: 1,
    generationId,
    deliveryVersion: input.deliveryVersion,
    deliveryKey,
    availableAt: availableAtDate.toISOString(),
    serviceTier: input.serviceTier,
    queuePriority: input.queuePriority,
  };
}

export function createGenerationDeliveryJobId(
  generationId: string,
  deliveryVersion: number,
  deliveryKey: string,
): string {
  if (!generationId.trim()) throw new Error("[generation-queue] generationId is required");
  if (!Number.isInteger(deliveryVersion) || deliveryVersion < 1) {
    throw new Error("[generation-queue] deliveryVersion must be a positive integer");
  }
  const jobId = deliveryKey.trim();
  if (!/^[A-Za-z0-9_-]{20,160}$/.test(jobId)) {
    throw new Error(
      "[generation-queue] deliveryKey must be a portable 20-160 character BullMQ job id",
    );
  }

  // The transactional outbox uses delivery_key as its publish-confirmation
  // fence. BullMQ jobId must remain exactly equal to that key so an idempotent
  // duplicate add can still be acknowledged with confirm_generation_outbox.
  return jobId;
}

function createQueue(options: {
  queueName: string;
  prefix?: string;
  connection?: ConnectionOptions;
  queueFactory?: GenerationQueueFactory;
  retention?: GenerationQueueRetention;
  retry?: GenerationQueueRetry;
}): GenerationQueueLike {
  if (!options.queueName.trim()) throw new Error("[generation-queue] queueName is required");
  if (!options.connection) {
    throw new Error("[generation-queue] connection or queue injection is required");
  }

  const queueOptions: QueueOptions = {
    connection: options.connection,
    prefix: options.prefix,
    // Let BullMQ wait for the Redis connection before issuing its initial
    // INFO/command handshake. A producer queue is created during Worker
    // bootstrap; fail-fast here produces a misleading `Stream isn't writeable`
    // error even when Redis is healthy and only a few milliseconds late.
    defaultJobOptions: {
      attempts: options.retry?.attempts ?? DEFAULT_RETRY.attempts,
      backoff: {
        type: "exponential",
        delay: options.retry?.backoffMs ?? DEFAULT_RETRY.backoffMs,
        jitter: 0.5,
      },
      removeOnComplete: options.retention?.completed ?? DEFAULT_COMPLETED_RETENTION,
      removeOnFail: options.retention?.failed ?? DEFAULT_FAILED_RETENTION,
    },
    streams: { events: { maxLen: 100_000 } },
  };
  const factory = options.queueFactory ?? ((name, runtimeOptions) => (
    new Queue<GenerationQueuePayload, unknown, typeof GENERATION_QUEUE_JOB_NAME>(name, runtimeOptions)
  ));
  return factory(options.queueName.trim(), queueOptions);
}
