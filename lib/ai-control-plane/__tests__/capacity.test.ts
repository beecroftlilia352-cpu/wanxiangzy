import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __aiCapacityTestUtils,
  acquireAiProviderCapacity,
  acquireAiProviderCapacityDetailed,
  getAiCapacityBackendStatus,
  getAiProviderInFlight,
  renewAiProviderCapacity,
  releaseAiProviderCapacity,
} from "@/lib/ai-control-plane/capacity.server";

describe("AI provider capacity pool", () => {
  beforeEach(() => {
    process.env.AI_ROUTER_CAPACITY_MODE = "local";
    __aiCapacityTestUtils.reset();
  });

  afterEach(() => {
    delete process.env.AI_ROUTER_CAPACITY_MODE;
    delete process.env.REDIS_URL;
    vi.unstubAllEnvs();
    vi.useRealTimers();
    vi.restoreAllMocks();
    __aiCapacityTestUtils.reset();
  });

  it("reserves and releases bounded concurrent slots", async () => {
    const input = { deploymentId: "provider-a", maxConcurrency: 2, requestsPerMinute: 20, burst: 0, ttlSeconds: 60 };
    const first = await acquireAiProviderCapacity(input);
    const second = await acquireAiProviderCapacity(input);
    const rejected = await acquireAiProviderCapacity(input);

    expect(first).toBeTruthy();
    expect(second).toBeTruthy();
    expect(rejected).toBeNull();
    expect(await getAiProviderInFlight(input.deploymentId)).toBe(2);

    await releaseAiProviderCapacity(first!);
    expect(await getAiProviderInFlight(input.deploymentId)).toBe(1);
  });

  it("keeps RPM accounting after a concurrency lease is released", async () => {
    const input = { deploymentId: "provider-b", maxConcurrency: 1, requestsPerMinute: 1, burst: 0, ttlSeconds: 60 };
    const lease = await acquireAiProviderCapacity(input);
    expect(lease).toBeTruthy();
    await releaseAiProviderCapacity(lease!);
    expect(await acquireAiProviderCapacity(input)).toBeNull();
  });

  it("reports whether concurrency or RPM caused backpressure", async () => {
    const concurrency = { deploymentId: "busy", maxConcurrency: 1, requestsPerMinute: 100, burst: 0, ttlSeconds: 60 };
    expect((await acquireAiProviderCapacityDetailed(concurrency)).lease).toBeTruthy();
    expect(await acquireAiProviderCapacityDetailed(concurrency)).toMatchObject({ lease: null, reason: "concurrency", inFlight: 1 });

    const rpm = { deploymentId: "rpm", maxConcurrency: 2, requestsPerMinute: 1, burst: 0, ttlSeconds: 60 };
    const lease = await acquireAiProviderCapacity(rpm);
    await releaseAiProviderCapacity(lease!);
    expect(await acquireAiProviderCapacityDetailed(rpm)).toMatchObject({ lease: null, reason: "rate_limit", requestCount: 1 });
  });

  it("reclaims zombie leases and renews live work", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-18T00:00:00Z"));
    const input = { deploymentId: "zombies", maxConcurrency: 1, requestsPerMinute: 100, burst: 0, ttlSeconds: 30 };
    const lease = await acquireAiProviderCapacity(input);
    vi.advanceTimersByTime(20_000);
    expect(await renewAiProviderCapacity(lease!, 30)).toBe(true);
    vi.advanceTimersByTime(11_000);
    expect(await getAiProviderInFlight(input.deploymentId)).toBe(1);
    vi.advanceTimersByTime(20_000);
    expect(await getAiProviderInFlight(input.deploymentId)).toBe(0);
  });

  it("never exceeds capacity under 100 contending tasks and leaks no leases", async () => {
    const input = { deploymentId: "pressure", maxConcurrency: 7, requestsPerMinute: 1_000, burst: 0, ttlSeconds: 60 };
    let active = 0;
    let peak = 0;
    await Promise.all(Array.from({ length: 100 }, async (_, index) => {
      let lease = await acquireAiProviderCapacity(input);
      while (!lease) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        lease = await acquireAiProviderCapacity(input);
      }
      active += 1;
      peak = Math.max(peak, active);
      expect(await getAiProviderInFlight(input.deploymentId)).toBeLessThanOrEqual(7);
      await new Promise((resolve) => setTimeout(resolve, index % 3));
      active -= 1;
      await releaseAiProviderCapacity(lease);
    }));
    expect(peak).toBe(7);
    expect(active).toBe(0);
    expect(await getAiProviderInFlight(input.deploymentId)).toBe(0);
  });

  it("fails closed when production Redis is missing or errors", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.AI_ROUTER_CAPACITY_MODE = "local";
    __aiCapacityTestUtils.reset();
    expect(getAiCapacityBackendStatus()).toMatchObject({ requestedMode: "redis", configured: false, failClosed: true });
    await expect(acquireAiProviderCapacityDetailed({ deploymentId: "missing", maxConcurrency: 20, requestsPerMinute: 100, burst: 10, ttlSeconds: 60 }))
      .resolves.toMatchObject({ lease: null, reason: "backend_unavailable" });

    process.env.REDIS_URL = "redis://localhost:6379";
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const redisError = Object.assign(new Error("redis://admin:secret@internal"), { code: "ECONNREFUSED" });
    __aiCapacityTestUtils.setRedisClient({ eval: vi.fn().mockRejectedValue(redisError) } as never);
    await expect(acquireAiProviderCapacityDetailed({ deploymentId: "error", maxConcurrency: 20, requestsPerMinute: 100, burst: 10, ttlSeconds: 60 }))
      .resolves.toMatchObject({ lease: null, reason: "backend_unavailable" });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("admin:secret");
  });

  it("uses Redis TIME and same-slot cluster keys", async () => {
    process.env.AI_ROUTER_CAPACITY_MODE = "redis";
    process.env.REDIS_URL = "rediss://redis.example.com:6380";
    const evalMock = vi.fn().mockResolvedValue([1, 0, 1, 1, 0]);
    __aiCapacityTestUtils.setRedisClient({ eval: evalMock } as never);
    await acquireAiProviderCapacity({ deploymentId: "provider-{a}", maxConcurrency: 10, requestsPerMinute: 100, burst: 0, ttlSeconds: 60 });
    expect(evalMock.mock.calls[0].slice(2, 4)).toEqual([
      "ai:route:{provider-_a_}:leases",
      "ai:route:{provider-_a_}:rpm",
    ]);
    expect(evalMock.mock.calls[0][0]).toContain("redis.call('TIME')");
  });
});
