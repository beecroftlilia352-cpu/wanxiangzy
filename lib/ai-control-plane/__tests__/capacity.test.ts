import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  __aiCapacityTestUtils,
  acquireAiProviderCapacity,
  getAiProviderInFlight,
  releaseAiProviderCapacity,
} from "@/lib/ai-control-plane/capacity.server";

describe("AI provider capacity pool", () => {
  beforeEach(() => {
    process.env.AI_ROUTER_CAPACITY_MODE = "local";
    __aiCapacityTestUtils.reset();
  });

  afterEach(() => {
    delete process.env.AI_ROUTER_CAPACITY_MODE;
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
});
