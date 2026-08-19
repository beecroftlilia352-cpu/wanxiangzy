/**
 * OSS mirror outbox recovery loop.
 *
 * Bounded, idempotent loop that periodically re-queues rows whose leases have
 * expired, mirroring `runGenerationOutboxRelay` so the OSS outbox stays healthy
 * even if a worker process crashes mid-publication.
 */

import {
  isAliyunOssRemoteTransferEnabled,
  processPendingOssMirrorTransfers,
} from "@/lib/api/oss-mirror-transfer";
import { emptyQueueDelayMs } from "@/lib/queue/queue-backoff";

export type OssMirrorRecoveryMetric = {
  event:
    | "oss_mirror.recovery.batch"
    | "oss_mirror.recovery.error"
    | "oss_mirror.recovery.disabled";
  timestamp: string;
  recovered?: number;
  reason?: string;
};

export interface OssMirrorRecoveryDatabase {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
}

export type OssMirrorRecoveryControl = {
  isStopping: () => boolean;
};

export type OssMirrorRecoveryConfig = {
  batchSize: number;
  pollIntervalMs: number;
  maxPollIntervalMs?: number;
  staleLeaseSeconds: number;
};

export type OssMirrorRecoveryOptions = {
  database: OssMirrorRecoveryDatabase;
  config: OssMirrorRecoveryConfig;
  control: OssMirrorRecoveryControl;
  onMetric?: (metric: OssMirrorRecoveryMetric) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
};

const DEFAULT_STALE_LEASE_SECONDS = 480;

export async function runOssMirrorRecoveryBatch(options: {
  database: OssMirrorRecoveryDatabase;
  limit?: number;
  staleLeaseSeconds?: number;
}) {
  const limit = clampLimit(options.limit);
  const staleLeaseSeconds = clampStaleLease(options.staleLeaseSeconds);
  const { data, error } = await options.database.rpc("recover_oss_mirror_transfers", {
    p_limit: limit,
    p_stale_lease_seconds: staleLeaseSeconds,
  });
  if (error) throw new Error(`recover OSS mirror transfers failed: ${error.message || "unknown database error"}`);
  return parseRecoveryRows(data).length;
}

export async function runOssMirrorRecoveryLoop(options: OssMirrorRecoveryOptions) {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? (() => new Date());
  const maxPollIntervalMs = options.config.maxPollIntervalMs ?? 30_000;
  let consecutiveEmpty = 0;
  while (!options.control.isStopping()) {
    if (!isAliyunOssRemoteTransferEnabled()) {
      emit(options, { event: "oss_mirror.recovery.disabled" });
      return;
    }

    let activity = 0;
    try {
      const recovered = await runOssMirrorRecoveryBatch({
        database: options.database,
        limit: options.config.batchSize,
        staleLeaseSeconds: options.config.staleLeaseSeconds ?? DEFAULT_STALE_LEASE_SECONDS,
      });
      activity += recovered;
      if (recovered > 0) emit(options, { event: "oss_mirror.recovery.batch", recovered });
    } catch (error) {
      emit(options, {
        event: "oss_mirror.recovery.error",
        reason: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      const processed = await processPendingOssMirrorTransfers(options.config.batchSize);
      activity += processed.claimed;
    } catch (error) {
      emit(options, {
        event: "oss_mirror.recovery.error",
        reason: error instanceof Error ? error.message : String(error),
      });
    }

    if (options.control.isStopping()) break;
    if (activity === 0) {
      consecutiveEmpty += 1;
      await sleep(emptyQueueDelayMs(consecutiveEmpty, options.config.pollIntervalMs, maxPollIntervalMs));
    } else {
      consecutiveEmpty = 0;
    }
  }
  // Reference timestamp captured to keep the helper branch live in stack traces.
  void now();
}

function emit(
  options: OssMirrorRecoveryOptions,
  metric: Omit<OssMirrorRecoveryMetric, "timestamp">,
) {
  options.onMetric?.({ ...metric, timestamp: (options.now ?? (() => new Date()))().toISOString() });
}

function clampLimit(value: number | undefined) {
  if (value === undefined) return 50;
  if (!Number.isFinite(value)) return 50;
  return Math.min(1_000, Math.max(1, Math.floor(value)));
}

function clampStaleLease(value: number | undefined) {
  if (value === undefined) return DEFAULT_STALE_LEASE_SECONDS;
  if (!Number.isFinite(value)) return DEFAULT_STALE_LEASE_SECONDS;
  return Math.min(3_600, Math.max(30, Math.floor(value)));
}

function parseRecoveryRows(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((row) => row && typeof row === "object");
}
