import { describe, expect, it } from "vitest";

import {
  getAiTenantConcurrencyPolicy,
  tenantDeploymentScope,
  tenantGlobalScope,
} from "@/lib/ai-control-plane/fairness.server";

describe("AI multi-tenant fairness policy", () => {
  it("uses bounded commercial defaults for standard and VIP traffic", () => {
    expect(getAiTenantConcurrencyPolicy({ serviceTier: "standard" }, {})).toEqual({
      serviceTier: "standard",
      userGlobalConcurrency: 12,
      userDeploymentConcurrency: 6,
      taskImageConcurrency: 6,
    });
    expect(getAiTenantConcurrencyPolicy({ serviceTier: "vip" }, {})).toEqual({
      serviceTier: "vip",
      userGlobalConcurrency: 24,
      userDeploymentConcurrency: 12,
      taskImageConcurrency: 8,
    });
  });

  it("treats missing or untrusted service tiers as standard", () => {
    expect(getAiTenantConcurrencyPolicy({}, {}).serviceTier).toBe("standard");
    expect(getAiTenantConcurrencyPolicy({ serviceTier: "enterprise" as never }, {}).serviceTier).toBe("standard");
  });

  it("rejects conflicting or unsafe configuration", () => {
    expect(() => getAiTenantConcurrencyPolicy({}, {
      AI_USER_CONCURRENCY_STANDARD: "8",
      AI_USER_CONCURRENCY_VIP: "4",
    })).toThrow(/VIP must be greater/);
    expect(() => getAiTenantConcurrencyPolicy({}, {
      AI_USER_CONCURRENCY_STANDARD: "2",
      AI_USER_DEPLOYMENT_CONCURRENCY_STANDARD: "3",
    })).toThrow(/cannot exceed user global/);
    expect(() => getAiTenantConcurrencyPolicy({}, {
      GENERATION_TASK_IMAGE_CONCURRENCY_STANDARD: "0",
    })).toThrow(/between 1 and 64/);
  });

  it("builds stable isolated scopes and strips Redis hash-tag injection", () => {
    expect(tenantGlobalScope(" user-{a} ")).toBe("tenant:user-_a_:global");
    expect(tenantDeploymentScope("user-a", "provider-{b}")).toBe("tenant:user-a:deployment:provider-_b_");
  });
});
