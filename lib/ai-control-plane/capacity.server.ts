import { Redis } from "@upstash/redis";

export type AiCapacityLease = {
  deploymentId: string;
  token: string;
  inFlight: number;
  source: "redis" | "local";
};

let redis: Redis | null | undefined;
const localLeases = new Map<string, Map<string, number>>();
const localRequests = new Map<string, number[]>();

const ACQUIRE_SCRIPT = `
local leaseKey = KEYS[1]
local rateKey = KEYS[2]
local now = tonumber(ARGV[1])
local expiresAt = tonumber(ARGV[2])
local token = ARGV[3]
local capacity = tonumber(ARGV[4])
local rateLimit = tonumber(ARGV[5])
redis.call('ZREMRANGEBYSCORE', leaseKey, '-inf', now)
redis.call('ZREMRANGEBYSCORE', rateKey, '-inf', now - 60000)
local inFlight = redis.call('ZCARD', leaseKey)
local rateCount = redis.call('ZCARD', rateKey)
if inFlight >= capacity or rateCount >= rateLimit then
  return {0, inFlight, rateCount}
end
redis.call('ZADD', leaseKey, expiresAt, token)
redis.call('ZADD', rateKey, now, token)
redis.call('PEXPIRE', leaseKey, math.max(expiresAt - now + 60000, 60000))
redis.call('PEXPIRE', rateKey, 120000)
return {1, inFlight + 1, rateCount + 1}
`;

const COUNT_SCRIPT = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', tonumber(ARGV[1]))
return redis.call('ZCARD', KEYS[1])
`;

export function getAiCapacityBackendStatus() {
  const requestedMode = (process.env.AI_ROUTER_CAPACITY_MODE || "redis").trim().toLowerCase() === "local"
    ? "local" as const
    : "redis" as const;
  const redisConfigured = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
  return {
    requestedMode,
    activeMode: requestedMode === "redis" && redisConfigured ? "redis" as const : "local" as const,
    distributed: requestedMode === "redis" && redisConfigured,
  };
}

export async function acquireAiProviderCapacity(input: {
  deploymentId: string;
  maxConcurrency: number;
  requestsPerMinute: number;
  burst: number;
  ttlSeconds: number;
}): Promise<AiCapacityLease | null> {
  const token = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = now + Math.max(30, input.ttlSeconds) * 1000;
  const rateLimit = Math.max(1, input.requestsPerMinute + input.burst);
  const client = getCapacityRedis();
  if (client) {
    try {
      const result = await client.eval(ACQUIRE_SCRIPT, [leaseKey(input.deploymentId), rateKey(input.deploymentId)], [
        now,
        expiresAt,
        token,
        Math.max(1, input.maxConcurrency),
        rateLimit,
      ]) as unknown;
      const values = Array.isArray(result) ? result.map(Number) : [];
      if (values[0] !== 1) return null;
      return { deploymentId: input.deploymentId, token, inFlight: values[1] || 1, source: "redis" };
    } catch (error) {
      console.warn("[ai-router] Redis capacity reservation unavailable, using process-local guard:", error);
    }
  }
  return acquireLocal(input, token, now, expiresAt, rateLimit);
}

export async function releaseAiProviderCapacity(lease: AiCapacityLease): Promise<void> {
  if (lease.source === "redis") {
    const client = getCapacityRedis();
    if (client) {
      try {
        await client.zrem(leaseKey(lease.deploymentId), lease.token);
        return;
      } catch (error) {
        console.warn("[ai-router] Redis capacity release unavailable:", error);
      }
    }
  }
  localLeases.get(lease.deploymentId)?.delete(lease.token);
}

export async function getAiProviderInFlight(deploymentId: string): Promise<number> {
  const now = Date.now();
  const client = getCapacityRedis();
  if (client) {
    try {
      const value = await client.eval(COUNT_SCRIPT, [leaseKey(deploymentId)], [now]);
      return Math.max(0, Number(value) || 0);
    } catch {
      // Fall through to the process-local view.
    }
  }
  const leases = localLeases.get(deploymentId);
  if (!leases) return 0;
  for (const [token, expiry] of leases) if (expiry <= now) leases.delete(token);
  return leases.size;
}

function acquireLocal(
  input: { deploymentId: string; maxConcurrency: number },
  token: string,
  now: number,
  expiresAt: number,
  rateLimit: number,
): AiCapacityLease | null {
  const leases = localLeases.get(input.deploymentId) || new Map<string, number>();
  for (const [leaseToken, expiry] of leases) if (expiry <= now) leases.delete(leaseToken);
  const requests = (localRequests.get(input.deploymentId) || []).filter((at) => at > now - 60_000);
  if (leases.size >= Math.max(1, input.maxConcurrency) || requests.length >= rateLimit) return null;
  leases.set(token, expiresAt);
  requests.push(now);
  localLeases.set(input.deploymentId, leases);
  localRequests.set(input.deploymentId, requests);
  return { deploymentId: input.deploymentId, token, inFlight: leases.size, source: "local" };
}

function getCapacityRedis(): Redis | null {
  if (redis !== undefined) return redis;
  if (getAiCapacityBackendStatus().requestedMode === "local") return (redis = null);
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return (redis = url && token ? new Redis({ url, token }) : null);
}

function leaseKey(deploymentId: string) { return `ai:route:leases:${deploymentId}`; }
function rateKey(deploymentId: string) { return `ai:route:rpm:${deploymentId}`; }

export const __aiCapacityTestUtils = {
  reset() {
    redis = undefined;
    localLeases.clear();
    localRequests.clear();
  },
};
