/**
 * Configuration for the long-running generation worker (scripts/worker.ts).
 *
 * The worker is a PM2-managed Node process that polls `claim_next_generation_jobs`
 * (Supabase RPC) and runs each claimed job in-process via `runNextGenerationJobs`.
 * It replaces the external cron that used to hit `/api/jobs/process-generations`
 * once per minute and is the only piece of the queue pipeline that can run jobs
 * longer than the Vercel function `maxDuration`.
 *
 * This module is the single source of truth for `WORKER_*` env vars. The
 * `parseWorkerConfig` function clamps and validates every value so the worker
 * can boot with confidence and the deploy script can read the same numbers
 * for PM2 process tuning.
 */

export type WorkerLogFormat = "text" | "json";

export type WorkerConfig = {
  enabled: boolean;
  dryRun: boolean;
  pollIntervalMs: number;
  errorBackoffMs: number;
  maxErrorBackoffMs: number;
  batchSize: number;
  staleMinutes: number;
  shutdownTimeoutMs: number;
  heartbeatIntervalMs: number;
  maxInFlightTimeoutMs: number;
  maxConsecutiveErrors: number;
  logFormat: WorkerLogFormat;
};

const DEFAULTS: WorkerConfig = {
  enabled: true,
  dryRun: false,
  pollIntervalMs: 1000,
  errorBackoffMs: 5000,
  maxErrorBackoffMs: 30000,
  batchSize: 2,
  staleMinutes: 8,
  shutdownTimeoutMs: 30000,
  heartbeatIntervalMs: 60000,
  maxInFlightTimeoutMs: 420000, // 7 minutes — MUST stay below staleMinutes * 60_000
  maxConsecutiveErrors: 10,
  logFormat: "text",
};

const BATCH_SIZE_MIN = 1;
const BATCH_SIZE_MAX = 10;
const STALE_MINUTES_MIN = 1;
const STALE_MINUTES_MAX = 60;
const MS_MIN = 100;

export class WorkerConfigError extends Error {
  constructor(
    public readonly field: keyof WorkerConfig,
    message: string,
  ) {
    super(`[worker/config] ${field}: ${message}`);
    this.name = "WorkerConfigError";
  }
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on", "enabled"].includes(normalized)) return true;
  if (["0", "false", "no", "off", "disabled"].includes(normalized)) return false;
  return fallback;
}

function parsePositiveInt(
  field: keyof WorkerConfig,
  value: string | undefined,
  fallback: number,
  min: number,
  max?: number,
): number {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw new WorkerConfigError(field, `expected integer, got ${JSON.stringify(value)}`);
  }
  if (parsed < min) {
    throw new WorkerConfigError(field, `must be >= ${min}, got ${parsed}`);
  }
  if (max !== undefined && parsed > max) {
    throw new WorkerConfigError(field, `must be <= ${max}, got ${parsed}`);
  }
  return parsed;
}

function parseLogFormat(value: string | undefined, fallback: WorkerLogFormat): WorkerLogFormat {
  if (value === undefined || value === "") return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "text" || normalized === "json") return normalized;
  throw new WorkerConfigError("logFormat", `expected "text" or "json", got ${JSON.stringify(value)}`);
}

/**
 * Parse and validate the `WORKER_*` env vars. Throws `WorkerConfigError` on
 * the first invalid value; the worker catches this at boot and exits 1 so
 * PM2 surfaces a clear error in `pm2 logs`.
 */
export function parseWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const config: WorkerConfig = {
    enabled: parseBoolean(env.WORKER_ENABLED, DEFAULTS.enabled),
    dryRun: parseBoolean(env.WORKER_DRY_RUN, DEFAULTS.dryRun),
    pollIntervalMs: parsePositiveInt("pollIntervalMs", env.WORKER_POLL_INTERVAL_MS, DEFAULTS.pollIntervalMs, MS_MIN),
    errorBackoffMs: parsePositiveInt("errorBackoffMs", env.WORKER_ERROR_BACKOFF_MS, DEFAULTS.errorBackoffMs, MS_MIN),
    maxErrorBackoffMs: parsePositiveInt(
      "maxErrorBackoffMs",
      env.WORKER_MAX_ERROR_BACKOFF_MS,
      DEFAULTS.maxErrorBackoffMs,
      MS_MIN,
    ),
    batchSize: parsePositiveInt(
      "batchSize",
      env.WORKER_BATCH_SIZE,
      DEFAULTS.batchSize,
      BATCH_SIZE_MIN,
      BATCH_SIZE_MAX,
    ),
    staleMinutes: parsePositiveInt(
      "staleMinutes",
      env.WORKER_STALE_MINUTES,
      DEFAULTS.staleMinutes,
      STALE_MINUTES_MIN,
      STALE_MINUTES_MAX,
    ),
    shutdownTimeoutMs: parsePositiveInt(
      "shutdownTimeoutMs",
      env.WORKER_SHUTDOWN_TIMEOUT_MS,
      DEFAULTS.shutdownTimeoutMs,
      MS_MIN,
    ),
    heartbeatIntervalMs: parsePositiveInt(
      "heartbeatIntervalMs",
      env.WORKER_HEARTBEAT_INTERVAL_MS,
      DEFAULTS.heartbeatIntervalMs,
      MS_MIN,
    ),
    maxInFlightTimeoutMs: parsePositiveInt(
      "maxInFlightTimeoutMs",
      env.WORKER_MAX_INFLIGHT_TIMEOUT_MS,
      DEFAULTS.maxInFlightTimeoutMs,
      MS_MIN,
    ),
    maxConsecutiveErrors: parsePositiveInt(
      "maxConsecutiveErrors",
      env.WORKER_MAX_CONSECUTIVE_ERRORS,
      DEFAULTS.maxConsecutiveErrors,
      1,
    ),
    logFormat: parseLogFormat(env.WORKER_LOG_FORMAT, DEFAULTS.logFormat),
  };

  // Cross-field invariant: the in-flight watchdog must yield before the RPC
  // reclaims a stale row. Otherwise a slow job gets picked up by the next tick
  // while the current worker is still running it.
  const staleMs = config.staleMinutes * 60_000;
  if (config.maxInFlightTimeoutMs >= staleMs) {
    throw new WorkerConfigError(
      "maxInFlightTimeoutMs",
      `must be strictly less than staleMinutes * 60_000 (${staleMs} ms); got ${config.maxInFlightTimeoutMs}`,
    );
  }
  if (config.errorBackoffMs > config.maxErrorBackoffMs) {
    throw new WorkerConfigError(
      "errorBackoffMs",
      `must be <= maxErrorBackoffMs (${config.maxErrorBackoffMs}); got ${config.errorBackoffMs}`,
    );
  }

  return config;
}

export const WORKER_CONFIG_DEFAULTS: Readonly<WorkerConfig> = Object.freeze({ ...DEFAULTS });
