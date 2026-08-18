import { Queue, type ConnectionOptions, type QueueOptions } from "bullmq";

import {
  parseBullMqConfig,
  type BullMqRuntimeConfig,
} from "@/lib/queue/bullmq-config.server";
import { sanitizeGenerationErrorMessage } from "@/lib/api/generation-errors";

export type GenerationBullMqHealth = {
  configured: boolean;
  reachable: boolean;
  queueName: string;
  latencyMs: number | null;
  workers: number;
  paused: boolean | null;
  counts: {
    waiting: number;
    active: number;
    delayed: number;
    prioritized: number;
    completed: number;
    failed: number;
    waitingChildren: number;
  };
  error: string | null;
};

export interface GenerationQueueHealthClient {
  getJobCounts(): Promise<Record<string, number>>;
  getWorkersCount(): Promise<number>;
  isPaused(): Promise<boolean>;
  close(): Promise<void>;
}

export type GenerationQueueHealthFactory = (
  name: string,
  options: QueueOptions,
) => GenerationQueueHealthClient;

const EMPTY_COUNTS = Object.freeze({
  waiting: 0,
  active: 0,
  delayed: 0,
  prioritized: 0,
  completed: 0,
  failed: 0,
  waitingChildren: 0,
});

export async function getGenerationBullMqHealth(options: {
  config?: BullMqRuntimeConfig;
  queueFactory?: GenerationQueueHealthFactory;
  timeoutMs?: number;
  now?: () => number;
} = {}): Promise<GenerationBullMqHealth> {
  let config: BullMqRuntimeConfig;
  try {
    config = options.config ?? parseBullMqConfig();
  } catch (error) {
    return unavailable("generation-jobs", false, safeErrorMessage(error));
  }
  if (!config.enabled || !config.connections) {
    return unavailable(config.queueName, false, null);
  }

  const queueFactory = options.queueFactory ?? defaultQueueFactory;
  const queue = queueFactory(config.queueName, {
    connection: config.connections.producer as ConnectionOptions,
    prefix: config.prefix,
    skipWaitingForReady: true,
  });
  const now = options.now ?? Date.now;
  const startedAt = now();
  try {
    const [rawCounts, workers, paused] = await withTimeout(
      Promise.all([queue.getJobCounts(), queue.getWorkersCount(), queue.isPaused()]),
      options.timeoutMs ?? Math.min(config.connections.producer.connectTimeout + 1_000, 10_000),
    );
    return {
      configured: true,
      reachable: true,
      queueName: config.queueName,
      latencyMs: Math.max(0, now() - startedAt),
      workers: nonNegativeInteger(workers),
      paused,
      counts: {
        waiting: nonNegativeInteger(rawCounts.waiting ?? rawCounts.wait),
        active: nonNegativeInteger(rawCounts.active),
        delayed: nonNegativeInteger(rawCounts.delayed),
        prioritized: nonNegativeInteger(rawCounts.prioritized),
        completed: nonNegativeInteger(rawCounts.completed),
        failed: nonNegativeInteger(rawCounts.failed),
        waitingChildren: nonNegativeInteger(rawCounts["waiting-children"]),
      },
      error: null,
    };
  } catch (error) {
    return unavailable(config.queueName, true, safeErrorMessage(error));
  } finally {
    await queue.close().catch(() => undefined);
  }
}

function defaultQueueFactory(name: string, options: QueueOptions) {
  return new Queue(name, options) as unknown as GenerationQueueHealthClient;
}

function unavailable(queueName: string, configured: boolean, error: string | null): GenerationBullMqHealth {
  return {
    configured,
    reachable: false,
    queueName,
    latencyMs: null,
    workers: 0,
    paused: null,
    counts: { ...EMPTY_COUNTS },
    error,
  };
}

function nonNegativeInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function safeErrorMessage(error: unknown) {
  return sanitizeGenerationErrorMessage(error, "BullMQ health check failed");
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("BullMQ health check timed out")), timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
