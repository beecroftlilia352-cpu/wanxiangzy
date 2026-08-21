import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  acquireScoped: vi.fn(),
  releaseScoped: vi.fn(),
  renewScoped: vi.fn(),
  acquireProvider: vi.fn(),
  releaseProvider: vi.fn(),
  renewProvider: vi.fn(),
  getInFlight: vi.fn(),
  getConfig: vi.fn(),
  loadHealth: vi.fn(),
  getAdminClient: vi.fn(),
}));

vi.mock("@/lib/ai-control-plane/capacity.server", () => ({
  acquireAiScopedCapacity: mocks.acquireScoped,
  releaseAiScopedCapacity: mocks.releaseScoped,
  renewAiScopedCapacity: mocks.renewScoped,
  acquireAiProviderCapacityDetailed: mocks.acquireProvider,
  releaseAiProviderCapacity: mocks.releaseProvider,
  renewAiProviderCapacity: mocks.renewProvider,
  getAiProviderInFlight: mocks.getInFlight,
}));

vi.mock("@/lib/ai-control-plane/server", () => ({
  getAiControlPlaneConfig: mocks.getConfig,
  loadAiProviderHealth: mocks.loadHealth,
}));

vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: mocks.getAdminClient }));

import {
  AiCapacityUnavailableError,
  AiProviderPoolExhaustedError,
  AiProviderHttpError,
  AiTenantCapacityUnavailableError,
  executeAiRouted,
} from "@/lib/ai-control-plane/router.server";

const CONFIG = {
  schemaVersion: 1,
  models: [{
    id: "image-model",
    displayName: "Image model",
    modality: "image",
    enabled: true,
    userVisible: true,
    defaultRoutingMode: "stable",
  }],
  providers: [
    { id: "provider-a", name: "A", baseUrl: "https://a.test", apiKey: "secret-a", enabled: true, timeoutMs: 60_000 },
    { id: "provider-b", name: "B", baseUrl: "https://b.test", apiKey: "secret-b", enabled: true, timeoutMs: 60_000 },
  ],
  deployments: [
    { id: "deployment-a", modelId: "image-model", providerId: "provider-a", upstreamModel: "a", protocol: "openai-image", enabled: true, priority: 1, weight: 100, maxConcurrency: 12, requestsPerMinute: 100, burst: 10, asyncMode: false, qualityScore: 1 },
    { id: "deployment-b", modelId: "image-model", providerId: "provider-b", upstreamModel: "b", protocol: "openai-image", enabled: true, priority: 2, weight: 100, maxConcurrency: 12, requestsPerMinute: 100, burst: 10, asyncMode: false, qualityScore: 1 },
  ],
  policy: {
    maxAttempts: 2,
    leaseTtlSeconds: 60,
    retryBaseDelayMs: 0,
    retryMaxDelayMs: 0,
    circuitFailureThreshold: 5,
    circuitMinimumSamples: 5,
    circuitOpenSeconds: 60,
    halfOpenMaxRequests: 1,
    smartWeights: { reliability: 1, latency: 0, cost: 0, capacity: 0, quality: 0 },
  },
};

describe("AI router tenant fairness integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    mocks.getConfig.mockResolvedValue(CONFIG);
    mocks.loadHealth.mockResolvedValue(new Map());
    mocks.getInFlight.mockResolvedValue(0);
    mocks.getAdminClient.mockReset();
    mocks.renewScoped.mockResolvedValue(true);
    mocks.renewProvider.mockResolvedValue(true);
    let scoped = 0;
    mocks.acquireScoped.mockImplementation(async ({ scopeKey, maxConcurrency }) => ({
      lease: { scopeKey, token: `scoped-${++scoped}`, inFlight: 1, source: "local", expiresAt: Date.now() + 60_000 },
      inFlight: 1,
      maxConcurrency,
      retryAfterSeconds: 0,
      backend: "local",
    }));
    let provider = 0;
    mocks.acquireProvider.mockImplementation(async ({ deploymentId, maxConcurrency }) => ({
      lease: { deploymentId, token: `provider-${++provider}`, inFlight: 1, source: "local", expiresAt: Date.now() + 60_000 },
      inFlight: 1,
      requestCount: 1,
      maxConcurrency,
      rateLimit: 110,
      retryAfterSeconds: 0,
      backend: "local",
    }));
  });

  it("applies VIP limits to global and per-deployment gates and releases both layers", async () => {
    await expect(executeAiRouted({
      modelId: "image-model",
      modality: "image",
      context: { userId: "10000000-0000-4000-8000-000000000001", serviceTier: "vip" },
      execute: async () => "ok",
    })).resolves.toBe("ok");

    expect(mocks.acquireScoped).toHaveBeenNthCalledWith(1, expect.objectContaining({
      scopeKey: "tenant:10000000-0000-4000-8000-000000000001:global",
      maxConcurrency: 8,
    }));
    expect(mocks.acquireScoped).toHaveBeenNthCalledWith(2, expect.objectContaining({
      scopeKey: expect.stringContaining(":deployment:deployment-a"),
      maxConcurrency: 4,
    }));
    expect(mocks.releaseScoped).toHaveBeenCalledTimes(3);
    expect(mocks.releaseProvider).toHaveBeenCalledOnce();
  });

  it("fails closed at the tenant gate without consuming supplier capacity", async () => {
    mocks.acquireScoped.mockResolvedValueOnce({
      lease: null,
      reason: "concurrency",
      inFlight: 4,
      maxConcurrency: 4,
      retryAfterSeconds: 5,
      backend: "local",
    });

    await expect(executeAiRouted({
      modelId: "image-model",
      modality: "image",
      context: { userId: "10000000-0000-4000-8000-000000000001", serviceTier: "standard" },
      execute: async () => "never",
    })).rejects.toBeInstanceOf(AiTenantCapacityUnavailableError);
    expect(mocks.acquireProvider).not.toHaveBeenCalled();
  });

  it("applies one shared provider-account bulkhead across deployments", async () => {
    const sharedLease = (scopeKey: string, maxConcurrency: number) => ({
      lease: { scopeKey, token: "shared", inFlight: 1, source: "local", expiresAt: Date.now() + 60_000 },
      inFlight: 1,
      maxConcurrency,
      retryAfterSeconds: 0,
      backend: "local",
    });
    mocks.acquireScoped.mockImplementation(async ({ scopeKey, maxConcurrency }) => {
      return scopeKey.startsWith("provider-account:")
        ? { lease: null, reason: "concurrency", inFlight: 24, maxConcurrency, retryAfterSeconds: 5, backend: "local" }
        : sharedLease(scopeKey, maxConcurrency);
    });
    await expect(executeAiRouted({
      modelId: "image-model",
      modality: "image",
      context: { userId: "10000000-0000-4000-8000-000000000001" },
      execute: async () => "never",
    })).rejects.toBeInstanceOf(AiCapacityUnavailableError);
    expect(mocks.acquireScoped).toHaveBeenCalledWith(expect.objectContaining({
      scopeKey: "provider-account:provider-a",
      requestsPerMinute: 100,
      burst: 10,
    }));
    expect(mocks.acquireProvider).not.toHaveBeenCalled();
  });

  it("propagates a lost durable execution lease to the provider abort signal", async () => {
    const execution = new AbortController();
    execution.abort(new Error("generation execution lease lost"));
    await expect(executeAiRouted({
      modelId: "image-model",
      modality: "image",
      context: {
        userId: "10000000-0000-4000-8000-000000000001",
        executionSignal: execution.signal,
      },
      execute: async (deployment) => deployment.abortSignal?.aborted === true,
    })).resolves.toBe(true);
  });

  it("releases a deployment lease before failing over and keeps a single global lease", async () => {
    const attempts: string[] = [];
    await expect(executeAiRouted({
      modelId: "image-model",
      modality: "image",
      context: { userId: "10000000-0000-4000-8000-000000000001", serviceTier: "standard" },
      execute: async (deployment) => {
        attempts.push(deployment.id);
        if (deployment.id === "deployment-a") throw new AiProviderHttpError("upstream", { status: 503 });
        return "recovered";
      },
    })).resolves.toBe("recovered");

    expect(attempts).toEqual(["deployment-a", "deployment-b"]);
    expect(mocks.releaseProvider).toHaveBeenCalledTimes(2);
    expect(mocks.releaseScoped).toHaveBeenCalledTimes(5);
    const releasedScopes = mocks.releaseScoped.mock.calls.map(([lease]) => lease.scopeKey);
    expect(releasedScopes.filter((scope) => scope.endsWith(":global"))).toHaveLength(1);
    expect(releasedScopes.filter((scope) => scope.includes(":deployment:"))).toHaveLength(2);
    expect(releasedScopes.filter((scope) => scope.startsWith("provider-account:"))).toHaveLength(2);
  });

  it("fails over authentication errors once without marking them durable-retryable", async () => {
    let calls = 0;
    const outcome = executeAiRouted({
      modelId: "image-model",
      modality: "image",
      context: { userId: "10000000-0000-4000-8000-000000000001" },
      execute: async () => {
        calls += 1;
        throw new AiProviderHttpError("forbidden", { status: 403 });
      },
    });

    await expect(outcome).rejects.toMatchObject({
      name: "AiProviderPoolExhaustedError",
      attemptedDeployments: 2,
      retryable: false,
    });
    expect(calls).toBe(2);
  });

  it("never calls a fallback after an irreversible provider submission", async () => {
    let calls = 0;
    await expect(executeAiRouted({
      modelId: "image-model",
      modality: "image",
      context: { userId: "10000000-0000-4000-8000-000000000001" },
      execute: async () => {
        calls += 1;
        throw new AiProviderHttpError("timeout after submit", { status: 504 });
      },
      canFailover: () => false,
    })).rejects.toBeInstanceOf(AiProviderPoolExhaustedError);
    expect(calls).toBe(1);
  });

  it("never turns telemetry failures after provider success into failover", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
    mocks.getAdminClient.mockReturnValue({
      from: () => ({ insert: () => { throw new Error("telemetry insert offline"); } }),
      rpc: () => Promise.reject(new Error("telemetry rpc offline")),
    });
    let calls = 0;
    await expect(executeAiRouted({
      modelId: "image-model",
      modality: "image",
      context: { userId: "10000000-0000-4000-8000-000000000001" },
      execute: async () => {
        calls += 1;
        return "provider-success";
      },
    })).resolves.toBe("provider-success");
    expect(calls).toBe(1);
  });
});
