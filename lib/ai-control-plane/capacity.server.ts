import IORedis from "ioredis";

export type AiCapacityLease = {
  deploymentId: string;
  token: string;
  inFlight: number;
  source: "redis" | "local";
  expiresAt?: number;
};

export type AiScopedCapacityLease = {
  scopeKey: string;
  token: string;
  inFlight: number;
  source: "redis" | "local";
  /** True when this lease also consumed an aggregate RPM token. */
  rateTracked?: boolean;
  expiresAt?: number;
};

export type AiScopedCapacityDecision = {
  lease: AiScopedCapacityLease | null;
  reason?: "concurrency" | "rate_limit" | "backend_unavailable";
  inFlight: number;
  maxConcurrency: number;
  retryAfterSeconds: number;
  backend: "redis" | "local";
};

export type AiCapacityRejectionReason = "concurrency" | "rate_limit" | "backend_unavailable";

export type AiCapacityDecision = {
  lease: AiCapacityLease | null;
  reason?: AiCapacityRejectionReason;
  inFlight: number;
  requestCount: number;
  maxConcurrency: number;
  rateLimit: number;
  retryAfterSeconds: number;
  backend: "redis" | "local";
};

type CapacityRedisClient = Pick<IORedis, "eval" | "zrem"> & Partial<Pick<IORedis, "disconnect">>;

let redis: CapacityRedisClient | null | undefined;
let redisConnecting: Promise<CapacityRedisClient | null> | undefined;
let redisReconnectAfter = 0;
const localLeases = new Map<string, Map<string, number>>();
const localScopedLeases = new Map<string, Map<string, number>>();
const localRequests = new Map<string, number[]>();
const localScopedRequests = new Map<string, number[]>();
const localScopedRequestTokens = new Map<string, Map<string, number>>();

// Both keys share a Redis Cluster hash tag. Redis TIME prevents application
// clock skew from admitting excess concurrency or extending stale leases.
const ACQUIRE_SCRIPT = `
local leaseKey = KEYS[1]
local rateKey = KEYS[2]
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local ttlMs = tonumber(ARGV[1])
local expiresAt = now + ttlMs
local token = ARGV[2]
local capacity = tonumber(ARGV[3])
local rateLimit = tonumber(ARGV[4])
redis.call('ZREMRANGEBYSCORE', leaseKey, '-inf', now)
redis.call('ZREMRANGEBYSCORE', rateKey, '-inf', now - 60000)
local inFlight = redis.call('ZCARD', leaseKey)
local rateCount = redis.call('ZCARD', rateKey)
if rateCount >= rateLimit then
  local oldest = redis.call('ZRANGE', rateKey, 0, 0, 'WITHSCORES')
  local retryMs = 1000
  if oldest[2] then retryMs = math.max(1000, tonumber(oldest[2]) + 60000 - now) end
  return {0, 2, inFlight, rateCount, math.ceil(retryMs / 1000)}
end
if inFlight >= capacity then return {0, 1, inFlight, rateCount, 5} end
redis.call('ZADD', leaseKey, expiresAt, token)
redis.call('ZADD', rateKey, now, token)
redis.call('PEXPIRE', leaseKey, math.max(ttlMs + 60000, 60000))
redis.call('PEXPIRE', rateKey, 120000)
return {1, 0, inFlight + 1, rateCount + 1, 0}
`;

const COUNT_SCRIPT = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
return redis.call('ZCARD', KEYS[1])
`;

const RENEW_SCRIPT = `
local leaseKey = KEYS[1]
local token = ARGV[1]
local ttlMs = tonumber(ARGV[2])
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local expiresAt = now + ttlMs
redis.call('ZREMRANGEBYSCORE', leaseKey, '-inf', now)
if not redis.call('ZSCORE', leaseKey, token) then return 0 end
redis.call('ZADD', leaseKey, expiresAt, token)
redis.call('PEXPIRE', leaseKey, math.max(ttlMs + 60000, 60000))
return 1
`;

const ACQUIRE_SCOPED_SCRIPT = `
local leaseKey = KEYS[1]
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local ttlMs = tonumber(ARGV[1])
local expiresAt = now + ttlMs
local token = ARGV[2]
local capacity = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', leaseKey, '-inf', now)
local inFlight = redis.call('ZCARD', leaseKey)
if inFlight >= capacity then return {0, inFlight, 5} end
redis.call('ZADD', leaseKey, expiresAt, token)
redis.call('PEXPIRE', leaseKey, math.max(ttlMs + 60000, 60000))
return {1, inFlight + 1, 0}
`;

const ACQUIRE_SCOPED_RATE_SCRIPT = `
local leaseKey = KEYS[1]
local rateKey = KEYS[2]
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local ttlMs = tonumber(ARGV[1])
local expiresAt = now + ttlMs
local token = ARGV[2]
local capacity = tonumber(ARGV[3])
local rateLimit = tonumber(ARGV[4])
redis.call('ZREMRANGEBYSCORE', leaseKey, '-inf', now)
redis.call('ZREMRANGEBYSCORE', rateKey, '-inf', now - 60000)
local inFlight = redis.call('ZCARD', leaseKey)
local rateCount = redis.call('ZCARD', rateKey)
if rateCount >= rateLimit then
  local oldest = redis.call('ZRANGE', rateKey, 0, 0, 'WITHSCORES')
  local retryMs = 1000
  if oldest[2] then retryMs = math.max(1000, tonumber(oldest[2]) + 60000 - now) end
  return {0, 2, inFlight, rateCount, math.ceil(retryMs / 1000)}
end
if inFlight >= capacity then return {0, 1, inFlight, rateCount, 5} end
redis.call('ZADD', leaseKey, expiresAt, token)
redis.call('ZADD', rateKey, now, token)
redis.call('PEXPIRE', leaseKey, math.max(ttlMs + 60000, 60000))
redis.call('PEXPIRE', rateKey, 120000)
return {1, 0, inFlight + 1, rateCount + 1, 0}
`;

export function getAiCapacityBackendStatus() {
  const requestedMode = process.env.NODE_ENV !== "production"
    && (process.env.AI_ROUTER_CAPACITY_MODE || "redis").trim().toLowerCase() === "local"
    ? "local" as const
    : "redis" as const;
  const configured = isStandardRedisUrl(process.env.REDIS_URL);
  return {
    requestedMode,
    activeMode: requestedMode,
    distributed: requestedMode === "redis" && configured,
    configured: requestedMode === "local" || configured,
    failClosed: requestedMode === "redis",
  };
}

/** Backwards-compatible lease-only API. Routing should use the detailed decision. */
export async function acquireAiProviderCapacity(input: {
  deploymentId: string;
  maxConcurrency: number;
  requestsPerMinute: number;
  burst: number;
  ttlSeconds: number;
}): Promise<AiCapacityLease | null> {
  return (await acquireAiProviderCapacityDetailed(input)).lease;
}

export async function acquireAiProviderCapacityDetailed(input: {
  deploymentId: string;
  maxConcurrency: number;
  requestsPerMinute: number;
  burst: number;
  ttlSeconds: number;
}): Promise<AiCapacityDecision> {
  const token = crypto.randomUUID();
  const now = Date.now();
  const ttlSeconds = Math.max(30, Math.ceil(finiteOr(input.ttlSeconds, 30)));
  const expiresAt = now + ttlSeconds * 1000;
  const maxConcurrency = Math.max(1, Math.floor(finiteOr(input.maxConcurrency, 1)));
  const rateLimit = Math.max(1, Math.floor(finiteOr(input.requestsPerMinute, 1)) + Math.max(0, Math.floor(finiteOr(input.burst, 0))));
  const status = getAiCapacityBackendStatus();

  if (status.requestedMode === "local") {
    return acquireLocal(input.deploymentId, token, now, expiresAt, maxConcurrency, rateLimit);
  }
  const client = await getCapacityRedis();
  if (!client) return backendUnavailable(maxConcurrency, rateLimit);
  try {
    const result = await client.eval(
      ACQUIRE_SCRIPT,
      2,
      leaseKey(input.deploymentId),
      rateKey(input.deploymentId),
      ttlSeconds * 1000,
      token,
      maxConcurrency,
      rateLimit,
    ) as unknown;
    const values = Array.isArray(result) ? result.map(Number) : [];
    if (values.length < 5 || !values.every(Number.isFinite) || (values[0] !== 0 && values[0] !== 1)) {
      throw new Error("invalid Redis capacity decision");
    }
    if (values[0] === 1) {
      const inFlight = positiveInteger(values[2], 1);
      return {
        lease: { deploymentId: input.deploymentId, token, inFlight, source: "redis", expiresAt },
        inFlight,
        requestCount: positiveInteger(values[3], 1),
        maxConcurrency,
        rateLimit,
        retryAfterSeconds: 0,
        backend: "redis",
      };
    }
    if (values[1] !== 1 && values[1] !== 2) throw new Error("invalid Redis capacity rejection reason");
    return rejected(
      values[1] === 2 ? "rate_limit" : "concurrency",
      nonNegativeInteger(values[2]),
      nonNegativeInteger(values[3]),
      maxConcurrency,
      rateLimit,
      values[4],
      "redis",
    );
  } catch (error) {
    markCapacityRedisUnavailable(client);
    console.error("[ai-router] Redis capacity reservation failed closed:", safeRedisErrorKind(error));
    return backendUnavailable(maxConcurrency, rateLimit);
  }
}

export async function renewAiProviderCapacity(lease: AiCapacityLease, ttlSeconds: number): Promise<boolean> {
  const ttl = Math.max(30, Math.ceil(finiteOr(ttlSeconds, 30)));
  const expiresAt = Date.now() + ttl * 1000;
  if (lease.source === "local") {
    const leases = localLeases.get(lease.deploymentId);
    if (!leases?.has(lease.token)) return false;
    leases.set(lease.token, expiresAt);
    lease.expiresAt = expiresAt;
    return true;
  }
  const client = await getCapacityRedis();
  if (!client) return false;
  try {
    const renewed = await client.eval(RENEW_SCRIPT, 1, leaseKey(lease.deploymentId), lease.token, ttl * 1000);
    if (Number(renewed) !== 1) return false;
    lease.expiresAt = expiresAt;
    return true;
  } catch (error) {
    markCapacityRedisUnavailable(client);
    console.error("[ai-router] Redis capacity lease renewal failed closed:", safeRedisErrorKind(error));
    return false;
  }
}

export async function releaseAiProviderCapacity(lease: AiCapacityLease): Promise<void> {
  if (lease.source === "redis") {
    const client = await getCapacityRedis();
    if (client) {
      try {
        await client.zrem(leaseKey(lease.deploymentId), lease.token);
        return;
      } catch (error) {
        markCapacityRedisUnavailable(client);
        console.warn("[ai-router] Redis capacity release unavailable; lease will expire:", safeRedisErrorKind(error));
      }
    }
    return;
  }
  localLeases.get(lease.deploymentId)?.delete(lease.token);
}

/** Distributed lease-only gate used for tenant fairness; it never consumes provider RPM. */
export async function acquireAiScopedCapacity(input: {
  scopeKey: string;
  maxConcurrency: number;
  ttlSeconds: number;
  requestsPerMinute?: number;
  burst?: number;
}): Promise<AiScopedCapacityDecision> {
  const scopeKey = input.scopeKey.trim();
  if (!scopeKey) throw new Error("AI capacity scopeKey is required");
  const token = crypto.randomUUID();
  const now = Date.now();
  const ttlSeconds = Math.max(30, Math.ceil(finiteOr(input.ttlSeconds, 30)));
  const expiresAt = now + ttlSeconds * 1000;
  const maxConcurrency = Math.max(1, Math.floor(finiteOr(input.maxConcurrency, 1)));
  const aggregateRateLimit = Math.max(0, Math.floor(finiteOr(input.requestsPerMinute || 0, 0)))
    + Math.max(0, Math.floor(finiteOr(input.burst || 0, 0)));
  const status = getAiCapacityBackendStatus();

  if (status.requestedMode === "local") {
    const leases = localScopedLeases.get(scopeKey) || new Map<string, number>();
    const requests = (localScopedRequests.get(scopeKey) || []).filter((at) => at > now - 60_000);
    const requestTokens = localScopedRequestTokens.get(scopeKey) || new Map<string, number>();
    for (const [leaseToken, expiry] of leases) if (expiry <= now) leases.delete(leaseToken);
    for (const [requestToken, at] of requestTokens) if (at <= now - 60_000) requestTokens.delete(requestToken);
    localScopedLeases.set(scopeKey, leases);
    localScopedRequests.set(scopeKey, requests);
    localScopedRequestTokens.set(scopeKey, requestTokens);
    if (aggregateRateLimit > 0 && requests.length >= aggregateRateLimit) {
      return { lease: null, reason: "rate_limit", inFlight: leases.size, maxConcurrency, retryAfterSeconds: Math.max(1, Math.ceil((requests[0] + 60_000 - now) / 1000)), backend: "local" };
    }
    if (leases.size >= maxConcurrency) {
      return { lease: null, reason: "concurrency", inFlight: leases.size, maxConcurrency, retryAfterSeconds: 5, backend: "local" };
    }
    leases.set(token, expiresAt);
    if (aggregateRateLimit > 0) {
      requests.push(now);
      requestTokens.set(token, now);
    }
    return {
      lease: { scopeKey, token, inFlight: leases.size, source: "local", rateTracked: aggregateRateLimit > 0, expiresAt },
      inFlight: leases.size,
      maxConcurrency,
      retryAfterSeconds: 0,
      backend: "local",
    };
  }

  const client = await getCapacityRedis();
  if (!client) return scopedBackendUnavailable(maxConcurrency);
  try {
    const result = aggregateRateLimit > 0
      ? await client.eval(
        ACQUIRE_SCOPED_RATE_SCRIPT,
        2,
        scopedLeaseKey(scopeKey),
        scopedRateKey(scopeKey),
        ttlSeconds * 1000,
        token,
        maxConcurrency,
        aggregateRateLimit,
      ) as unknown
      : await client.eval(
        ACQUIRE_SCOPED_SCRIPT,
        1,
        scopedLeaseKey(scopeKey),
        ttlSeconds * 1000,
        token,
        maxConcurrency,
      ) as unknown;
    const values = Array.isArray(result) ? result.map(Number) : [];
    if (values.length < (aggregateRateLimit > 0 ? 5 : 3) || !values.every(Number.isFinite) || (values[0] !== 0 && values[0] !== 1)) {
      throw new Error("invalid Redis scoped capacity decision");
    }
    if (values[0] === 0) {
      return {
        lease: null,
        reason: aggregateRateLimit > 0 && values[1] === 2 ? "rate_limit" : "concurrency",
        inFlight: nonNegativeInteger(aggregateRateLimit > 0 ? values[2] : values[1]),
        maxConcurrency,
        retryAfterSeconds: clampRetryAfter(aggregateRateLimit > 0 ? values[4] : values[2]),
        backend: "redis",
      };
    }
    const inFlight = positiveInteger(aggregateRateLimit > 0 ? values[2] : values[1], 1);
    return {
      lease: { scopeKey, token, inFlight, source: "redis", rateTracked: aggregateRateLimit > 0, expiresAt },
      inFlight,
      maxConcurrency,
      retryAfterSeconds: 0,
      backend: "redis",
    };
  } catch (error) {
    markCapacityRedisUnavailable(client);
    console.error("[ai-router] Redis scoped capacity reservation failed closed:", safeRedisErrorKind(error));
    return scopedBackendUnavailable(maxConcurrency);
  }
}

export async function renewAiScopedCapacity(lease: AiScopedCapacityLease, ttlSeconds: number): Promise<boolean> {
  const ttl = Math.max(30, Math.ceil(finiteOr(ttlSeconds, 30)));
  const expiresAt = Date.now() + ttl * 1000;
  if (lease.source === "local") {
    const leases = localScopedLeases.get(lease.scopeKey);
    if (!leases?.has(lease.token)) return false;
    leases.set(lease.token, expiresAt);
    lease.expiresAt = expiresAt;
    return true;
  }
  const client = await getCapacityRedis();
  if (!client) return false;
  try {
    const renewed = await client.eval(RENEW_SCRIPT, 1, scopedLeaseKey(lease.scopeKey), lease.token, ttl * 1000);
    if (Number(renewed) !== 1) return false;
    lease.expiresAt = expiresAt;
    return true;
  } catch (error) {
    markCapacityRedisUnavailable(client);
    console.error("[ai-router] Redis scoped capacity lease renewal failed closed:", safeRedisErrorKind(error));
    return false;
  }
}

export async function releaseAiScopedCapacity(lease: AiScopedCapacityLease): Promise<void> {
  if (lease.source === "local") {
    localScopedLeases.get(lease.scopeKey)?.delete(lease.token);
    return;
  }
  const client = await getCapacityRedis();
  if (!client) return;
  try {
    await client.zrem(scopedLeaseKey(lease.scopeKey), lease.token);
  } catch (error) {
    markCapacityRedisUnavailable(client);
    console.warn("[ai-router] Redis scoped capacity release unavailable; lease will expire:", safeRedisErrorKind(error));
  }
}

/** Rolls back an admission that never reached the upstream provider. */
export async function rollbackAiScopedCapacity(lease: AiScopedCapacityLease): Promise<void> {
  await releaseAiScopedCapacity(lease);
  if (!lease.rateTracked) return;
  if (lease.source === "local") {
    const requestTokens = localScopedRequestTokens.get(lease.scopeKey);
    const requestAt = requestTokens?.get(lease.token);
    requestTokens?.delete(lease.token);
    if (requestAt !== undefined) {
      const requests = localScopedRequests.get(lease.scopeKey) || [];
      const index = requests.indexOf(requestAt);
      if (index >= 0) requests.splice(index, 1);
    }
    return;
  }
  const client = await getCapacityRedis();
  if (!client) return;
  try {
    await client.zrem(scopedRateKey(lease.scopeKey), lease.token);
  } catch (error) {
    markCapacityRedisUnavailable(client);
    console.warn("[ai-router] Redis scoped RPM rollback unavailable; token will age out:", safeRedisErrorKind(error));
  }
}

export async function getAiProviderInFlight(deploymentId: string): Promise<number> {
  const status = getAiCapacityBackendStatus();
  if (status.requestedMode === "redis") {
    const client = await getCapacityRedis();
    if (!client) return 0;
    try {
      return Math.max(0, Number(await client.eval(COUNT_SCRIPT, 1, leaseKey(deploymentId))) || 0);
    } catch (error) {
      markCapacityRedisUnavailable(client);
      console.warn("[ai-router] Redis capacity count unavailable:", safeRedisErrorKind(error));
      return 0;
    }
  }
  const now = Date.now();
  const leases = localLeases.get(deploymentId);
  if (!leases) return 0;
  for (const [token, expiry] of leases) if (expiry <= now) leases.delete(token);
  return leases.size;
}

function acquireLocal(
  deploymentId: string,
  token: string,
  now: number,
  expiresAt: number,
  maxConcurrency: number,
  rateLimit: number,
): AiCapacityDecision {
  const leases = localLeases.get(deploymentId) || new Map<string, number>();
  for (const [leaseToken, expiry] of leases) if (expiry <= now) leases.delete(leaseToken);
  const requests = (localRequests.get(deploymentId) || []).filter((at) => at > now - 60_000);
  localLeases.set(deploymentId, leases);
  localRequests.set(deploymentId, requests);
  if (requests.length >= rateLimit) {
    return rejected("rate_limit", leases.size, requests.length, maxConcurrency, rateLimit, Math.ceil((requests[0] + 60_000 - now) / 1000), "local");
  }
  if (leases.size >= maxConcurrency) return rejected("concurrency", leases.size, requests.length, maxConcurrency, rateLimit, 5, "local");
  leases.set(token, expiresAt);
  requests.push(now);
  return {
    lease: { deploymentId, token, inFlight: leases.size, source: "local", expiresAt },
    inFlight: leases.size,
    requestCount: requests.length,
    maxConcurrency,
    rateLimit,
    retryAfterSeconds: 0,
    backend: "local",
  };
}

function rejected(
  reason: AiCapacityRejectionReason,
  inFlight: number,
  requestCount: number,
  maxConcurrency: number,
  rateLimit: number,
  retryAfterSeconds: number | undefined,
  backend: "redis" | "local",
): AiCapacityDecision {
  return { lease: null, reason, inFlight, requestCount, maxConcurrency, rateLimit, retryAfterSeconds: clampRetryAfter(retryAfterSeconds), backend };
}

function backendUnavailable(maxConcurrency: number, rateLimit: number) {
  return rejected("backend_unavailable", 0, 0, maxConcurrency, rateLimit, 5, "redis");
}

function scopedBackendUnavailable(maxConcurrency: number): AiScopedCapacityDecision {
  return { lease: null, reason: "backend_unavailable", inFlight: 0, maxConcurrency, retryAfterSeconds: 5, backend: "redis" };
}

async function getCapacityRedis(): Promise<CapacityRedisClient | null> {
  if (redis !== undefined) return redis;
  if (redisConnecting) return redisConnecting;
  if (Date.now() < redisReconnectAfter) return null;
  if (getAiCapacityBackendStatus().requestedMode === "local") return (redis = null);
  const url = process.env.REDIS_URL?.trim();
  if (!isStandardRedisUrl(url)) return (redis = null);
  const client = new IORedis(url!, {
    connectionName: "wanxiangzy:ai-capacity",
    connectTimeout: 5_000,
    enableOfflineQueue: false,
    keepAlive: 10_000,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: (attempt) => attempt >= 3 ? null : Math.min(250 * 2 ** Math.max(0, attempt - 1), 1_000),
  });
  client.on("error", (error) => console.error("[ai-router] Redis capacity connection error:", safeRedisErrorKind(error)));
  redisConnecting = client.connect()
    .then(() => {
      redis = client;
      redisReconnectAfter = 0;
      return client;
    })
    .catch((error) => {
      client.disconnect();
      redisReconnectAfter = Date.now() + 2_000;
      console.error("[ai-router] Redis capacity initial connection failed closed:", safeRedisErrorKind(error));
      return null;
    })
    .finally(() => {
      redisConnecting = undefined;
    });
  return redisConnecting;
}

function markCapacityRedisUnavailable(client: CapacityRedisClient) {
  if (redis === client) redis = undefined;
  redisReconnectAfter = Date.now() + 1_000;
  try {
    client.disconnect?.();
  } catch {
    // A new connection will be attempted after the bounded outage backoff.
  }
}

function redisHashTag(deploymentId: string) { return deploymentId.replace(/[{}]/g, "_"); }
function leaseKey(deploymentId: string) { return `ai:route:{${redisHashTag(deploymentId)}}:leases`; }
function rateKey(deploymentId: string) { return `ai:route:{${redisHashTag(deploymentId)}}:rpm`; }
function scopedLeaseKey(scopeKey: string) { return `ai:fair:{${redisHashTag(scopeKey)}}:leases`; }
function scopedRateKey(scopeKey: string) { return `ai:fair:{${redisHashTag(scopeKey)}}:rpm`; }
function finiteOr(value: number, fallback: number) { return Number.isFinite(value) ? value : fallback; }
function positiveInteger(value: number | undefined, fallback: number) { return Number.isFinite(value) && value! > 0 ? Math.floor(value!) : fallback; }
function nonNegativeInteger(value: number | undefined) { return Number.isFinite(value) && value! > 0 ? Math.floor(value!) : 0; }
function clampRetryAfter(value: number | undefined) { return Math.min(300, Math.max(1, Math.ceil(Number.isFinite(value) ? value! : 5))); }
function safeRedisErrorKind(error: unknown) {
  const candidate = error && typeof error === "object" ? error as { name?: unknown; code?: unknown } : {};
  const name = typeof candidate.name === "string" && /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(candidate.name) ? candidate.name : "RedisError";
  const code = typeof candidate.code === "string" && /^[A-Za-z0-9_.-]{1,64}$/.test(candidate.code) ? candidate.code : "";
  return code ? `${name}:${code}` : name;
}
function isStandardRedisUrl(value: string | undefined) {
  if (!value?.trim()) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "redis:" || url.protocol === "rediss:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export const __aiCapacityTestUtils = {
  reset() {
    redis = undefined;
    redisConnecting = undefined;
    redisReconnectAfter = 0;
    localLeases.clear();
  localScopedLeases.clear();
    localScopedRequests.clear();
    localScopedRequestTokens.clear();
    localRequests.clear();
  },
  setRedisClient(client: CapacityRedisClient | null) {
    redis = client;
  },
  keys(deploymentId: string) {
    return { lease: leaseKey(deploymentId), rate: rateKey(deploymentId) };
  },
  scopedKey(scopeKey: string) {
    return scopedLeaseKey(scopeKey);
  },
};
