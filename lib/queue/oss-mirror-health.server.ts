/**
 * OSS mirror outbox health probe.
 *
 * Mirrors the contract of `getGenerationBullMqHealth`: returns aggregate
 * Postgres counts plus the age of the oldest pending row so the admin UI and
 * the production deploy gate can alert on stalls without exposing the URL or
 * any other credentials.
 */

import { getAdminClient } from "@/lib/supabase/admin";
import { isAliyunOssMirrorEnabled } from "@/lib/api/oss-mirror-transfer";
import { sanitizeGenerationErrorMessage } from "@/lib/api/generation-errors";

export type OssMirrorHealthCounts = {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  staleProcessing: number;
};

export type OssMirrorHealth = {
  configured: boolean;
  reachable: boolean;
  latencyMs: number | null;
  counts: OssMirrorHealthCounts;
  oldestPendingAgeSeconds: number;
  oldestProcessingAgeSeconds: number;
  lastRecoveredAt: string | null;
  lastCompletedAt: string | null;
  error: string | null;
};

const EMPTY_COUNTS: OssMirrorHealthCounts = Object.freeze({
  pending: 0,
  processing: 0,
  completed: 0,
  failed: 0,
  staleProcessing: 0,
});

export interface OssMirrorHealthClient {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
}

export async function getOssMirrorHealth(options: {
  client?: OssMirrorHealthClient;
  timeoutMs?: number;
  now?: () => number;
} = {}): Promise<OssMirrorHealth> {
  if (!isAliyunOssMirrorEnabled()) {
    return {
      configured: false,
      reachable: false,
      latencyMs: null,
      counts: { ...EMPTY_COUNTS },
      oldestPendingAgeSeconds: 0,
      oldestProcessingAgeSeconds: 0,
      lastRecoveredAt: null,
      lastCompletedAt: null,
      error: null,
    };
  }

  const client = options.client ?? (getAdminClient() as unknown as OssMirrorHealthClient);
  const now = options.now ?? Date.now;
  const startedAt = now();
  try {
    const result = await withTimeout(
      client.rpc("get_oss_mirror_queue_health"),
      options.timeoutMs ?? 5_000,
    );
    if (result.error) {
      return unavailable(true, safeError(result.error.message), startedAt, now);
    }
    const parsed = parseHealthRow(result.data);
    return {
      configured: true,
      reachable: true,
      latencyMs: Math.max(0, now() - startedAt),
      counts: parsed.counts,
      oldestPendingAgeSeconds: parsed.oldestPendingAgeSeconds,
      oldestProcessingAgeSeconds: parsed.oldestProcessingAgeSeconds,
      lastRecoveredAt: parsed.lastRecoveredAt,
      lastCompletedAt: parsed.lastCompletedAt,
      error: null,
    };
  } catch (error) {
    return unavailable(true, safeError(error), startedAt, now);
  }
}

function unavailable(configured: boolean, error: string, startedAt: number, now: () => number): OssMirrorHealth {
  return {
    configured,
    reachable: false,
    latencyMs: Math.max(0, now() - startedAt),
    counts: { ...EMPTY_COUNTS },
    oldestPendingAgeSeconds: 0,
    oldestProcessingAgeSeconds: 0,
    lastRecoveredAt: null,
    lastCompletedAt: null,
    error: error ? error.slice(0, 500) : null,
  };
}

function parseHealthRow(value: unknown): {
  counts: OssMirrorHealthCounts;
  oldestPendingAgeSeconds: number;
  oldestProcessingAgeSeconds: number;
  lastRecoveredAt: string | null;
  lastCompletedAt: string | null;
} {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate || typeof candidate !== "object") {
    throw new Error("OSS mirror health RPC returned a malformed payload");
  }
  const row = candidate as Record<string, unknown>;
  return {
    counts: {
      pending: nonNegativeInteger(row.pending_count),
      processing: nonNegativeInteger(row.processing_count),
      completed: nonNegativeInteger(row.completed_count),
      failed: nonNegativeInteger(row.failed_count),
      staleProcessing: nonNegativeInteger(row.stale_processing_count),
    },
    oldestPendingAgeSeconds: nonNegativeInteger(row.oldest_pending_age_seconds),
    oldestProcessingAgeSeconds: nonNegativeInteger(row.oldest_processing_age_seconds),
    lastRecoveredAt: optionalIsoString(row.last_recovered_at),
    lastCompletedAt: optionalIsoString(row.last_completed_at),
  };
}

function nonNegativeInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function optionalIsoString(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return value;
  return null;
}

function safeError(error: unknown) {
  return sanitizeGenerationErrorMessage(error, "OSS mirror health check failed");
}

async function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("OSS mirror health check timed out")), timeoutMs);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
