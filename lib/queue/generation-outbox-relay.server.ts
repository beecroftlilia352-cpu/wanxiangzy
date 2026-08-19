import type { BullMqRuntimeConfig } from "@/lib/queue/bullmq-config.server";
import type {
  EnqueueGenerationDeliveryInput,
  EnqueueGenerationDeliveryResult,
} from "@/lib/queue/generation-queue.server";
import { sanitizeGenerationErrorMessage } from "@/lib/api/generation-errors";
import { emptyQueueDelayMs } from "@/lib/queue/queue-backoff";
import type { WakeNotifier } from "@/lib/queue/outbox-wake.server";

export type GenerationOutboxRow = {
  outbox_id: string;
  generation_id: string;
  delivery_version: number;
  delivery_key: string;
  available_at: string;
  lease_token: string;
  attempts: number;
};

export type GenerationOutboxRelayMetric = {
  event:
    | "relay.batch"
    | "relay.publish.error"
    | "relay.lease_lost"
    | "relay.recovery"
    | "relay.recovery.error";
  timestamp: string;
  outboxId?: string;
  generationId?: string;
  deliveryVersion?: number;
  reason?: string;
  claimed?: number;
  published?: number;
  retried?: number;
  leaseLost?: number;
  failed?: number;
  recovered?: unknown;
};

export type GenerationOutboxRelayBatchResult = {
  claimed: number;
  published: number;
  retried: number;
  leaseLost: number;
  failed: number;
};

type RpcResult = { data: unknown; error: { message?: string } | null };

export interface GenerationOutboxDatabase {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<RpcResult>;
}

export interface GenerationOutboxPublisher {
  enqueue(input: EnqueueGenerationDeliveryInput): Promise<EnqueueGenerationDeliveryResult>;
}

export type GenerationOutboxRelayControl = {
  isStopping: () => boolean;
};

type GenerationOutboxWake = Pick<WakeNotifier, "wait" | "isConnected">;

export async function runGenerationOutboxRelayBatch(options: {
  database: GenerationOutboxDatabase;
  publisher: GenerationOutboxPublisher;
  batchSize: number;
  concurrency: number;
  claimTtlMs: number;
  onMetric?: (metric: GenerationOutboxRelayMetric) => void;
  now?: () => Date;
}): Promise<GenerationOutboxRelayBatchResult> {
  const { data, error } = await options.database.rpc("claim_generation_outbox", {
    p_limit: options.batchSize,
    p_lease_seconds: Math.ceil(options.claimTtlMs / 1_000),
  });
  if (error) throw new Error(`outbox claim failed: ${error.message || "unknown database error"}`);

  const rows = parseOutboxRows(data);
  const result: GenerationOutboxRelayBatchResult = {
    claimed: rows.length,
    published: 0,
    retried: 0,
    leaseLost: 0,
    failed: 0,
  };

  await runBounded(rows, options.concurrency, async (row) => {
    try {
      const delivery = await options.publisher.enqueue({
        generationId: row.generation_id,
        deliveryVersion: row.delivery_version,
        deliveryKey: row.delivery_key,
        availableAt: row.available_at,
      });
      if (delivery.jobId !== row.delivery_key) {
        throw new Error("publisher returned a job id that does not match the outbox delivery fence");
      }

      const confirmation = await options.database.rpc("confirm_generation_outbox", {
        p_outbox_id: row.outbox_id,
        p_lease_token: row.lease_token,
        p_bullmq_job_id: delivery.jobId,
      });
      if (confirmation.error) {
        throw new Error(`outbox confirm failed: ${confirmation.error.message || "unknown database error"}`);
      }
      if (confirmation.data !== true) {
        result.leaseLost += 1;
        emit(options, {
          event: "relay.lease_lost",
          outboxId: row.outbox_id,
          generationId: row.generation_id,
          deliveryVersion: row.delivery_version,
          reason: "publish lease changed before confirmation",
        });
        return;
      }
      result.published += 1;
    } catch (publishError) {
      const reason = safeErrorMessage(publishError);
      const retryDelay = computeOutboxRetryDelaySeconds(row.attempts, row.outbox_id);
      try {
        const nack = await options.database.rpc("nack_generation_outbox", {
          p_outbox_id: row.outbox_id,
          p_lease_token: row.lease_token,
          p_error: reason.slice(0, 1_000),
          p_delay_seconds: retryDelay,
        });
        if (nack.error) throw new Error(nack.error.message || "outbox nack failed");
        if (nack.data === true) result.retried += 1;
        else result.leaseLost += 1;
      } catch (nackError) {
        result.failed += 1;
        emit(options, {
          event: "relay.publish.error",
          outboxId: row.outbox_id,
          generationId: row.generation_id,
          deliveryVersion: row.delivery_version,
          reason: `${reason}; nack: ${safeErrorMessage(nackError)}`,
        });
        return;
      }
      emit(options, {
        event: "relay.publish.error",
        outboxId: row.outbox_id,
        generationId: row.generation_id,
        deliveryVersion: row.delivery_version,
        reason,
      });
    }
  });

  emit(options, { event: "relay.batch", ...result });
  return result;
}

export async function runGenerationOutboxRelay(options: {
  database: GenerationOutboxDatabase;
  publisher: GenerationOutboxPublisher;
  config: BullMqRuntimeConfig["relay"];
  control: GenerationOutboxRelayControl;
  wake?: GenerationOutboxWake;
  onMetric?: (metric: GenerationOutboxRelayMetric) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}) {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? (() => new Date());
  let lastRecoveryAt = 0;
  let consecutiveEmpty = 0;

  while (!options.control.isStopping()) {
    const batch = await runGenerationOutboxRelayBatch({
      database: options.database,
      publisher: options.publisher,
      batchSize: options.config.batchSize,
      concurrency: options.config.concurrency,
      claimTtlMs: options.config.claimTtlMs,
      onMetric: options.onMetric,
      now,
    });

    const currentTime = now().getTime();
    if (currentTime - lastRecoveryAt >= options.config.recoveryIntervalMs) {
      lastRecoveryAt = currentTime;
      try {
        const recovery = await options.database.rpc("recover_generation_outbox", {
          p_limit: Math.max(options.config.batchSize, 500),
        });
        if (recovery.error) throw new Error(recovery.error.message || "outbox recovery failed");
        emit(options, { event: "relay.recovery", recovered: recovery.data });
      } catch (error) {
        emit(options, { event: "relay.recovery.error", reason: safeErrorMessage(error) });
      }
    }

    if (batch.claimed === 0 && !options.control.isStopping()) {
      consecutiveEmpty += 1;
      if (options.wake?.isConnected()) {
        // Event-driven path: sleep until an outbox INSERT wakes us or the
        // periodic recovery sweep fires. No idle polling while connected.
        // The wait is bounded by the smallest fallback interval so a missed
        // Realtime event (or an unconfigured publication) can never delay
        // dispatch beyond the polling backstop.
        await options.wake.wait(
          Math.min(options.config.recoveryIntervalMs, options.config.maxPollIntervalMs),
          () => options.control.isStopping(),
        );
      } else {
        await sleep(
          emptyQueueDelayMs(consecutiveEmpty, options.config.pollIntervalMs, options.config.maxPollIntervalMs),
        );
      }
    } else {
      consecutiveEmpty = 0;
    }
  }
}

export function computeOutboxRetryDelaySeconds(attempts: number, stableKey: string) {
  const exponent = Math.min(Math.max(Math.floor(attempts) - 1, 0), 10);
  const base = Math.min(3_600, 2 ** exponent);
  const hash = [...stableKey].reduce((total, char) => (total * 33 + char.charCodeAt(0)) >>> 0, 5381);
  const jitter = 0.75 + (hash % 501) / 1_000;
  return Math.min(3_600, Math.max(1, Math.round(base * jitter)));
}

function parseOutboxRows(value: unknown): GenerationOutboxRow[] {
  if (!Array.isArray(value)) throw new Error("outbox claim returned a malformed result");
  return value.map((row) => {
    if (!isRecord(row)
      || typeof row.outbox_id !== "string"
      || typeof row.generation_id !== "string"
      || !Number.isInteger(row.delivery_version)
      || Number(row.delivery_version) < 1
      || typeof row.delivery_key !== "string"
      || typeof row.available_at !== "string"
      || !Number.isFinite(Date.parse(row.available_at))
      || typeof row.lease_token !== "string"
      || !Number.isInteger(row.attempts)) {
      throw new Error("outbox claim returned a malformed row");
    }
    return row as GenerationOutboxRow;
  });
}

async function runBounded<T>(items: T[], concurrency: number, run: (item: T) => Promise<void>) {
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(items.length, Math.max(1, concurrency)) }, async () => {
    while (index < items.length) {
      const item = items[index++];
      await run(item);
    }
  }));
}

function emit(
  options: { onMetric?: (metric: GenerationOutboxRelayMetric) => void; now?: () => Date },
  metric: Omit<GenerationOutboxRelayMetric, "timestamp">,
) {
  options.onMetric?.({ ...metric, timestamp: (options.now ?? (() => new Date()))().toISOString() });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeErrorMessage(error: unknown) {
  return sanitizeGenerationErrorMessage(error, "generation outbox relay failed");
}
