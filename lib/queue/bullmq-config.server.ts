/**
 * BullMQ runtime configuration boundary.
 *
 * This module intentionally creates plain ioredis-compatible option objects
 * instead of opening sockets. API producers, workers and observers must each
 * construct their own client from the corresponding object; Worker and
 * QueueEvents may duplicate their long-lived/blocking connections internally.
 */

export type GenerationQueueMode = "inline" | "bullmq";

export type BullMqRedisConnectionOptions = {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db: number;
  tls?: Record<string, never>;
  connectionName: string;
  connectTimeout: number;
  keepAlive: number;
  enableReadyCheck: boolean;
  enableOfflineQueue: boolean;
  maxRetriesPerRequest: number | null;
  retryStrategy: (attempt: number) => number | null;
  /** BullMQ owns key prefixing; ioredis keyPrefix is deliberately forbidden. */
  keyPrefix?: never;
};

export type BullMqRuntimeConfig = {
  mode: GenerationQueueMode;
  enabled: boolean;
  prefix: string;
  queueName: string;
  connections: {
    producer: BullMqRedisConnectionOptions;
    worker: BullMqRedisConnectionOptions;
    observer: BullMqRedisConnectionOptions;
  } | null;
  worker: {
    concurrency: number;
    lockDurationMs: number;
    lockRenewTimeMs: number;
    stalledIntervalMs: number;
    maxStalledCount: number;
  };
  retention: {
    completedCount: number;
    completedAgeSeconds: number;
    failedCount: number;
    failedAgeSeconds: number;
  };
  jobs: {
    attempts: number;
    backoffMs: number;
  };
  relay: {
    batchSize: number;
    concurrency: number;
    pollIntervalMs: number;
    maxPollIntervalMs: number;
    recoveryIntervalMs: number;
    claimTtlMs: number;
  };
};

export type BullMqEnvironment = Readonly<Record<string, string | undefined>>;

type BullMqConfigField =
  | "GENERATION_QUEUE_MODE"
  | "REDIS_URL"
  | "BULLMQ_PREFIX"
  | "BULLMQ_QUEUE_NAME"
  | "BULLMQ_CONNECT_TIMEOUT_MS"
  | "BULLMQ_WORKER_CONCURRENCY"
  | "BULLMQ_LOCK_DURATION_MS"
  | "BULLMQ_LOCK_RENEW_TIME_MS"
  | "BULLMQ_STALLED_INTERVAL_MS"
  | "BULLMQ_MAX_STALLED_COUNT"
  | "BULLMQ_COMPLETED_RETENTION_COUNT"
  | "BULLMQ_COMPLETED_RETENTION_AGE_SECONDS"
  | "BULLMQ_FAILED_RETENTION_COUNT"
  | "BULLMQ_FAILED_RETENTION_AGE_SECONDS"
  | "BULLMQ_JOB_ATTEMPTS"
  | "BULLMQ_JOB_BACKOFF_MS"
  | "BULLMQ_RELAY_BATCH_SIZE"
  | "BULLMQ_RELAY_CONCURRENCY"
  | "BULLMQ_RELAY_POLL_INTERVAL_MS"
  | "BULLMQ_RELAY_MAX_POLL_INTERVAL_MS"
  | "BULLMQ_RELAY_RECOVERY_INTERVAL_MS"
  | "BULLMQ_RELAY_CLAIM_TTL_MS";

export class BullMqConfigError extends Error {
  constructor(public readonly field: BullMqConfigField, message: string) {
    super(`[bullmq/config] ${field}: ${message}`);
    this.name = "BullMqConfigError";
  }
}

const DEFAULTS = Object.freeze({
  prefix: "{wanxiangzy:generation}",
  queueName: "generation-jobs",
  connectTimeoutMs: 5_000,
  workerConcurrency: 64,
  lockDurationMs: 60_000,
  lockRenewTimeMs: 20_000,
  stalledIntervalMs: 30_000,
  maxStalledCount: 2,
  completedRetentionCount: 5_000,
  completedRetentionAgeSeconds: 24 * 60 * 60,
  failedRetentionCount: 20_000,
  failedRetentionAgeSeconds: 7 * 24 * 60 * 60,
  // Business failures settle normally; thrown processor errors are therefore
  // infrastructure failures and receive a bounded exponential retry budget.
  jobAttempts: 3,
  jobBackoffMs: 5_000,
  relayBatchSize: 100,
  relayConcurrency: 8,
  relayPollIntervalMs: 500,
  relayMaxPollIntervalMs: 10_000,
  relayRecoveryIntervalMs: 300_000,
  relayClaimTtlMs: 60_000,
});

export const BULLMQ_CONFIG_DEFAULTS = DEFAULTS;

export function parseBullMqConfig(env: BullMqEnvironment = process.env): BullMqRuntimeConfig {
  const mode = parseMode(env.GENERATION_QUEUE_MODE, env.NODE_ENV);
  const enabled = mode === "bullmq";
  const prefix = parsePrefix(env.BULLMQ_PREFIX);
  const queueName = parseQueueName(env.BULLMQ_QUEUE_NAME);
  const connectTimeoutMs = integerEnv(env, "BULLMQ_CONNECT_TIMEOUT_MS", DEFAULTS.connectTimeoutMs, 1_000, 30_000);
  const worker = {
    concurrency: integerEnv(env, "BULLMQ_WORKER_CONCURRENCY", DEFAULTS.workerConcurrency, 1, 64),
    lockDurationMs: integerEnv(env, "BULLMQ_LOCK_DURATION_MS", DEFAULTS.lockDurationMs, 10_000, 30 * 60_000),
    lockRenewTimeMs: integerEnv(env, "BULLMQ_LOCK_RENEW_TIME_MS", DEFAULTS.lockRenewTimeMs, 1_000, 15 * 60_000),
    stalledIntervalMs: integerEnv(env, "BULLMQ_STALLED_INTERVAL_MS", DEFAULTS.stalledIntervalMs, 5_000, 5 * 60_000),
    maxStalledCount: integerEnv(env, "BULLMQ_MAX_STALLED_COUNT", DEFAULTS.maxStalledCount, 1, 10),
  };
  const retention = {
    completedCount: integerEnv(env, "BULLMQ_COMPLETED_RETENTION_COUNT", DEFAULTS.completedRetentionCount, 100, 1_000_000),
    completedAgeSeconds: integerEnv(env, "BULLMQ_COMPLETED_RETENTION_AGE_SECONDS", DEFAULTS.completedRetentionAgeSeconds, 3_600, 30 * 24 * 60 * 60),
    failedCount: integerEnv(env, "BULLMQ_FAILED_RETENTION_COUNT", DEFAULTS.failedRetentionCount, 100, 1_000_000),
    failedAgeSeconds: integerEnv(env, "BULLMQ_FAILED_RETENTION_AGE_SECONDS", DEFAULTS.failedRetentionAgeSeconds, 3_600, 90 * 24 * 60 * 60),
  };
  const jobs = {
    attempts: integerEnv(env, "BULLMQ_JOB_ATTEMPTS", DEFAULTS.jobAttempts, 1, 5),
    backoffMs: integerEnv(env, "BULLMQ_JOB_BACKOFF_MS", DEFAULTS.jobBackoffMs, 1_000, 5 * 60_000),
  };
  const relay = {
    batchSize: integerEnv(env, "BULLMQ_RELAY_BATCH_SIZE", DEFAULTS.relayBatchSize, 1, 1_000),
    concurrency: integerEnv(env, "BULLMQ_RELAY_CONCURRENCY", DEFAULTS.relayConcurrency, 1, 128),
    pollIntervalMs: integerEnv(env, "BULLMQ_RELAY_POLL_INTERVAL_MS", DEFAULTS.relayPollIntervalMs, 100, 60_000),
    maxPollIntervalMs: integerEnv(env, "BULLMQ_RELAY_MAX_POLL_INTERVAL_MS", DEFAULTS.relayMaxPollIntervalMs, 1_000, 600_000),
    recoveryIntervalMs: integerEnv(env, "BULLMQ_RELAY_RECOVERY_INTERVAL_MS", DEFAULTS.relayRecoveryIntervalMs, 10_000, 3_600_000),
    claimTtlMs: integerEnv(env, "BULLMQ_RELAY_CLAIM_TTL_MS", DEFAULTS.relayClaimTtlMs, 5_000, 30 * 60_000),
  };

  if (worker.lockRenewTimeMs * 2 > worker.lockDurationMs) {
    throw new BullMqConfigError(
      "BULLMQ_LOCK_RENEW_TIME_MS",
      `must be <= half of BULLMQ_LOCK_DURATION_MS (${Math.floor(worker.lockDurationMs / 2)} ms)`,
    );
  }
  if (worker.stalledIntervalMs > worker.lockDurationMs) {
    throw new BullMqConfigError(
      "BULLMQ_STALLED_INTERVAL_MS",
      `must be <= BULLMQ_LOCK_DURATION_MS (${worker.lockDurationMs} ms)`,
    );
  }
  if (relay.concurrency > relay.batchSize) {
    throw new BullMqConfigError(
      "BULLMQ_RELAY_CONCURRENCY",
      `must be <= BULLMQ_RELAY_BATCH_SIZE (${relay.batchSize})`,
    );
  }
  if (relay.claimTtlMs <= connectTimeoutMs + relay.pollIntervalMs) {
    throw new BullMqConfigError(
      "BULLMQ_RELAY_CLAIM_TTL_MS",
      `must exceed connect timeout plus poll interval (${connectTimeoutMs + relay.pollIntervalMs} ms)`,
    );
  }

  let connections: BullMqRuntimeConfig["connections"] = null;
  if (enabled) {
    const rawRedisUrl = env.REDIS_URL?.trim();
    if (!rawRedisUrl) {
      const context = env.NODE_ENV === "production" ? "production BullMQ mode is fail-closed; " : "BullMQ mode requires ";
      throw new BullMqConfigError("REDIS_URL", `${context}a redis:// or rediss:// URL`);
    }
    const endpoint = parseRedisUrl(rawRedisUrl);
    connections = createConnections(endpoint, connectTimeoutMs, queueName);
  }

  return { mode, enabled, prefix, queueName, connections, worker, retention, jobs, relay };
}

type RedisEndpoint = {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db: number;
  tls: boolean;
};

function parseMode(value: string | undefined, nodeEnv: string | undefined): GenerationQueueMode {
  const production = nodeEnv === "production";
  const normalized = value?.trim().toLowerCase() || (production ? "bullmq" : "inline");
  if (normalized !== "inline" && normalized !== "bullmq") {
    throw new BullMqConfigError("GENERATION_QUEUE_MODE", `expected inline or bullmq; got ${JSON.stringify(value)}`);
  }
  if (production && normalized !== "bullmq") {
    throw new BullMqConfigError("GENERATION_QUEUE_MODE", "production requires bullmq; inline execution is restricted to development and test");
  }
  return normalized;
}

function parseRedisUrl(value: string): RedisEndpoint {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BullMqConfigError("REDIS_URL", "must be a valid redis:// or rediss:// URL");
  }
  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    throw new BullMqConfigError("REDIS_URL", `protocol must be redis:// or rediss://, got ${url.protocol || "none"}`);
  }
  if (!url.hostname) throw new BullMqConfigError("REDIS_URL", "hostname is required");
  if (url.hash) throw new BullMqConfigError("REDIS_URL", "URL fragments are not supported");
  if ([...url.searchParams.keys()].some((key) => key.toLowerCase() === "keyprefix")) {
    throw new BullMqConfigError("REDIS_URL", "ioredis keyPrefix is forbidden; configure BULLMQ_PREFIX instead");
  }
  if (url.search) throw new BullMqConfigError("REDIS_URL", "URL query parameters are not supported");

  const port = url.port ? Number(url.port) : 6379;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new BullMqConfigError("REDIS_URL", "port must be between 1 and 65535");
  }
  const path = url.pathname || "";
  if (path !== "" && path !== "/" && !/^\/\d+$/.test(path)) {
    throw new BullMqConfigError("REDIS_URL", "path must be a numeric Redis database, for example /0");
  }
  const db = path === "" || path === "/" ? 0 : Number(path.slice(1));
  if (!Number.isInteger(db) || db < 0 || db > 15) {
    throw new BullMqConfigError("REDIS_URL", "Redis database must be between 0 and 15");
  }

  return {
    host: url.hostname,
    port,
    username: decodeUrlCredential(url.username),
    password: decodeUrlCredential(url.password),
    db,
    tls: url.protocol === "rediss:",
  };
}

function decodeUrlCredential(value: string) {
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    throw new BullMqConfigError("REDIS_URL", "contains an invalid percent-encoded credential");
  }
}

function createConnections(endpoint: RedisEndpoint, connectTimeout: number, queueName: string): NonNullable<BullMqRuntimeConfig["connections"]> {
  const base = (role: "producer" | "worker" | "observer"): Omit<BullMqRedisConnectionOptions, "enableOfflineQueue" | "maxRetriesPerRequest" | "retryStrategy"> => ({
    host: endpoint.host,
    port: endpoint.port,
    ...(endpoint.username ? { username: endpoint.username } : {}),
    ...(endpoint.password ? { password: endpoint.password } : {}),
    db: endpoint.db,
    ...(endpoint.tls ? { tls: {} } : {}),
    connectionName: `wanxiangzy:${queueName}:${role}`,
    connectTimeout,
    keepAlive: 10_000,
    enableReadyCheck: true,
  });
  const persistentRetry = (attempt: number) => Math.max(1_000, Math.min(Math.exp(Math.max(1, attempt)) * 1_000, 20_000));
  return {
    producer: {
      ...base("producer"),
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy: (attempt) => attempt >= 3 ? null : Math.min(250 * 2 ** Math.max(0, attempt - 1), 1_000),
    },
    worker: {
      ...base("worker"),
      enableOfflineQueue: true,
      maxRetriesPerRequest: null,
      retryStrategy: persistentRetry,
    },
    observer: {
      ...base("observer"),
      enableOfflineQueue: true,
      maxRetriesPerRequest: null,
      retryStrategy: persistentRetry,
    },
  };
}

function parsePrefix(value: string | undefined) {
  const prefix = value?.trim() || DEFAULTS.prefix;
  if (!/^\{[A-Za-z0-9][A-Za-z0-9:_-]{0,63}\}$/.test(prefix)) {
    throw new BullMqConfigError("BULLMQ_PREFIX", "must be one Redis Cluster hash tag such as {wanxiangzy:generation}");
  }
  return prefix;
}

function parseQueueName(value: string | undefined) {
  const queueName = value?.trim() || DEFAULTS.queueName;
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(queueName)) {
    throw new BullMqConfigError("BULLMQ_QUEUE_NAME", "must be 1-80 characters using letters, numbers, underscore, or hyphen");
  }
  return queueName;
}

function integerEnv(env: BullMqEnvironment, field: BullMqConfigField, fallback: number, min: number, max: number) {
  const raw = env[field]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) throw new BullMqConfigError(field, `expected an integer, got ${JSON.stringify(env[field])}`);
  if (value < min || value > max) throw new BullMqConfigError(field, `must be between ${min} and ${max}, got ${value}`);
  return value;
}
