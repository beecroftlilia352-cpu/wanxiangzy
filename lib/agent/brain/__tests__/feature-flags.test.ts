import { describe, expect, it } from "vitest";
import { getAgentFeatureFlags } from "@/lib/agent/brain/feature-flags";

describe("agent feature flags", () => {
  it("returns stable bucketed rollout config", () => {
    const a = getAgentFeatureFlags("user-a");
    const b = getAgentFeatureFlags("user-a");
    expect(a.userBucket).toBe(b.userBucket);
    expect(a.rolloutPercent).toBeGreaterThanOrEqual(0);
    expect(a.rolloutPercent).toBeLessThanOrEqual(100);
  });
});
