import { getAdminClient } from "@/lib/supabase/admin";
import { emptyQueueDelayMs } from "@/lib/queue/queue-backoff";
import {
  deleteAliyunOssRegistryObject,
  MediaValidationError,
  type MediaValidationControl,
  type MediaValidationDatabase,
} from "@/lib/queue/media-validation-worker.server";

type CleanupJob = {
  assetId: string;
  objectKey: string;
  bucketName: string;
  cleanupToken: string;
  fenceVersion: number;
  cleanupAttempts: number;
};

export type MediaCleanupMetric = {
  event: "media_cleanup.batch" | "media_cleanup.completed" | "media_cleanup.deferred" | "media_cleanup.error";
  timestamp: string;
  assetId?: string;
  count?: number;
  reason?: string;
};

export type MediaCleanupConfig = {
  batchSize: number;
  concurrency: number;
  pollIntervalMs: number;
  maxPollIntervalMs: number;
  leaseSeconds: number;
};

export function parseMediaCleanupConfig(env: NodeJS.ProcessEnv = process.env): MediaCleanupConfig {
  return {
    batchSize: intEnv(env.MEDIA_CLEANUP_BATCH_SIZE, 1, 500, 20),
    concurrency: intEnv(env.MEDIA_CLEANUP_CONCURRENCY, 1, 32, 4),
    pollIntervalMs: intEnv(env.MEDIA_CLEANUP_POLL_INTERVAL_MS, 1_000, 3_600_000, 60_000),
    maxPollIntervalMs: intEnv(env.MEDIA_CLEANUP_MAX_POLL_INTERVAL_MS, 5_000, 3_600_000, 600_000),
    leaseSeconds: intEnv(env.MEDIA_CLEANUP_LEASE_SECONDS, 30, 1_800, 300),
  };
}
export async function runMediaAssetCleanupBatch(options: {
  database?: MediaValidationDatabase;
  config?: MediaCleanupConfig;
  removeObject?: (objectKey: string, bucketName: string) => Promise<void>;
  onMetric?: (metric: MediaCleanupMetric) => void;
  now?: () => Date;
}) {
  const database = options.database ?? (getAdminClient() as unknown as MediaValidationDatabase);
  const config = options.config ?? parseMediaCleanupConfig();
  const removeObject = options.removeObject ?? deleteAliyunOssRegistryObject;
  const { data, error } = await database.rpc("claim_media_asset_cleanup", {
    p_limit: Math.min(config.batchSize, config.concurrency),
    p_lease_seconds: config.leaseSeconds,
  });
  if (error) throw new Error(`claim media asset cleanup failed: ${error.message || "unknown database error"}`);
  const jobs = parseCleanupJobs(data);
  const outcomes = await runBounded(jobs, config.concurrency, async (job) => {
    try {
      const authorized = await database.rpc("authorize_media_asset_cleanup", {
        p_asset_id: job.assetId,
        p_cleanup_token: job.cleanupToken,
        p_fence_version: job.fenceVersion,
      });
      if (authorized.error || authorized.data !== true) {
        throw new MediaValidationError(
          `media cleanup authorization failed: ${authorized.error?.message || "not authorized"}`,
          false,
        );
      }
      await removeObject(job.objectKey, job.bucketName);
      const confirmed = await database.rpc("confirm_media_asset_cleanup", {
        p_asset_id: job.assetId,
        p_cleanup_token: job.cleanupToken,
        p_fence_version: job.fenceVersion,
      });
      if (confirmed.error || confirmed.data !== true) {
        throw new MediaValidationError(
          `media cleanup confirmation failed: ${confirmed.error?.message || "not confirmed"}`,
          true,
        );
      }
      emit(options, { event: "media_cleanup.completed", assetId: job.assetId });
      return "completed" as const;
    } catch (cause) {
      const delaySeconds = Math.min(86_400, Math.max(60, 300 * Math.pow(2, Math.max(0, job.cleanupAttempts - 1))));
      const deferred = await database.rpc("nack_media_asset_cleanup", {
        p_asset_id: job.assetId,
        p_cleanup_token: job.cleanupToken,
        p_fence_version: job.fenceVersion,
        p_error: safeMessage(cause).slice(0, 2_000),
        p_delay_seconds: delaySeconds,
      });
      if (deferred.error) throw new Error(`nack media cleanup failed: ${deferred.error.message || "unknown"}`);
      emit(options, { event: "media_cleanup.deferred", assetId: job.assetId, reason: safeMessage(cause) });
      return "deferred" as const;
    }
  });
  emit(options, { event: "media_cleanup.batch", count: jobs.length });
  return {
    claimed: jobs.length,
    completed: outcomes.filter((value) => value === "completed").length,
    deferred: outcomes.filter((value) => value === "deferred").length,
  };
}

export async function runMediaAssetCleanupLoop(options: {
  database?: MediaValidationDatabase;
  config?: MediaCleanupConfig;
  control: MediaValidationControl;
  onMetric?: (metric: MediaCleanupMetric) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
}) {
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const basePollIntervalMs = options.config?.pollIntervalMs ?? 60_000;
  const maxPollIntervalMs = options.config?.maxPollIntervalMs ?? 600_000;
  let consecutiveEmpty = 0;
  while (!options.control.isStopping()) {
    try {
      const result = await runMediaAssetCleanupBatch(options);
      if (result.claimed > 0) {
        consecutiveEmpty = 0;
        continue;
      }
    } catch (error) {
      emit(options, { event: "media_cleanup.error", reason: safeMessage(error) });
    }
    if (!options.control.isStopping()) {
      consecutiveEmpty += 1;
      await sleep(emptyQueueDelayMs(consecutiveEmpty, basePollIntervalMs, maxPollIntervalMs));
    }
  }
}

function parseCleanupJobs(value: unknown): CleanupJob[] {
  if (!Array.isArray(value)) return [];
  return value.map((candidate) => {
    const row = candidate && typeof candidate === "object" ? candidate as Record<string, unknown> : {};
    const job = {
      assetId: String(row.asset_id || ""), objectKey: String(row.object_key || ""),
      bucketName: String(row.bucket_name || ""), cleanupToken: String(row.cleanup_token || ""),
      fenceVersion: numberValue(row.fence_version), cleanupAttempts: numberValue(row.cleanup_attempts),
    };
    if (!job.assetId || !job.objectKey || !job.bucketName || !job.cleanupToken || job.fenceVersion < 1) {
      throw new Error("media cleanup claim returned a malformed row");
    }
    return job;
  });
}

async function runBounded<T, R>(values: T[], concurrency: number, work: (value: T) => Promise<R>) {
  const results = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await work(values[index]);
    }
  }));
  return results;
}

function emit(
  options: { onMetric?: (metric: MediaCleanupMetric) => void; now?: () => Date },
  metric: Omit<MediaCleanupMetric, "timestamp">,
) {
  options.onMetric?.({ ...metric, timestamp: (options.now ?? (() => new Date()))().toISOString() });
}

function intEnv(value: string | undefined, min: number, max: number, fallback: number) {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.floor(parsed) : 0;
}

function safeMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
