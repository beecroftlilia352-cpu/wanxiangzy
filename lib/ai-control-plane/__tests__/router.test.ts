import { describe, expect, it } from "vitest";

import {
  AiCapacityUnavailableError,
  AiProviderPoolExhaustedError,
  AiProviderHttpError,
  classifyAiProviderError,
  getAiRoutingCandidateScore,
  isAiCapacityUnavailableError,
  isAiProviderPoolExhaustedError,
} from "@/lib/ai-control-plane/router.server";

describe("AI router error policy", () => {
  it("normalizes the queue backpressure retry window", () => {
    expect(new AiCapacityUnavailableError("busy", 1).retryAfterSeconds).toBe(5);
    expect(new AiCapacityUnavailableError("busy", 900).retryAfterSeconds).toBe(300);
  });

  it("recognizes capacity errors across bundle boundaries", () => {
    expect(isAiCapacityUnavailableError({ name: "AiCapacityUnavailableError", retryAfterSeconds: 30 })).toBe(true);
    expect(isAiCapacityUnavailableError({ name: "AiCapacityUnavailableError", retryAfterSeconds: 301 })).toBe(false);
    expect(isAiCapacityUnavailableError(new Error("busy"))).toBe(false);
  });

  it("marks exhausted provider attempts as retryable without calling it capacity saturation", () => {
    const error = new AiProviderPoolExhaustedError("gpt-image-2", 2, 2, new Error("HTTP 503"));
    expect(error.message).toContain("2 次供应商调用均失败");
    expect(error.retryable).toBe(true);
    expect(isAiProviderPoolExhaustedError(error)).toBe(true);
    expect(isAiProviderPoolExhaustedError({
      name: "AiProviderPoolExhaustedError",
      attemptedDeployments: 1,
      candidateDeployments: 2,
    })).toBe(true);
  });

  it("fails over on rate limit and preserves retry-after", () => {
    const result = classifyAiProviderError(new AiProviderHttpError("limited", {
      status: 429,
      retryAfterSeconds: 45,
    }));
    expect(result).toMatchObject({ category: "rate_limit", retryable: true, retryAfterSeconds: 45 });
  });

  it("does not retry customer validation errors", () => {
    expect(classifyAiProviderError(new AiProviderHttpError("bad request", { status: 400 })))
      .toMatchObject({ category: "validation", retryable: false });
  });

  it("classifies HTTP 451 as a non-retryable content policy rejection", () => {
    expect(classifyAiProviderError(new AiProviderHttpError("blocked", { status: 451 })))
      .toMatchObject({ category: "content_policy", status: 451, retryable: false });
  });

  it("fails over on network and upstream 5xx failures", () => {
    expect(classifyAiProviderError(new Error("fetch ECONNRESET"))).toMatchObject({ category: "network", retryable: true });
    expect(classifyAiProviderError(new AiProviderHttpError("upstream", { status: 503 })))
      .toMatchObject({ category: "provider", retryable: true });
  });

  it("distributes a stable same-priority pool by configured weight", () => {
    const selected = { primary: 0, secondary: 0 };
    for (let index = 0; index < 10_000; index += 1) {
      const requestId = `request-${index}`;
      const primary = getAiRoutingCandidateScore({
        mode: "stable",
        requestId,
        deployment: { id: "primary", weight: 300 },
      });
      const secondary = getAiRoutingCandidateScore({
        mode: "stable",
        requestId,
        deployment: { id: "secondary", weight: 100 },
      });
      selected[primary > secondary ? "primary" : "secondary"] += 1;
    }

    const primaryShare = selected.primary / (selected.primary + selected.secondary);
    expect(primaryShare).toBeGreaterThan(0.72);
    expect(primaryShare).toBeLessThan(0.78);
  });

  it("uses health as an effective weight without collapsing smart traffic onto one provider", () => {
    const selected = { healthy: 0, degraded: 0 };
    for (let index = 0; index < 10_000; index += 1) {
      const requestId = `smart-${index}`;
      const healthy = getAiRoutingCandidateScore({
        mode: "smart",
        requestId,
        deployment: { id: "healthy", weight: 100 },
        dynamicScore: 0.9,
      });
      const degraded = getAiRoutingCandidateScore({
        mode: "smart",
        requestId,
        deployment: { id: "degraded", weight: 100 },
        dynamicScore: 0.7,
      });
      selected[healthy > degraded ? "healthy" : "degraded"] += 1;
    }

    const healthyShare = selected.healthy / (selected.healthy + selected.degraded);
    expect(healthyShare).toBeGreaterThan(0.7);
    expect(healthyShare).toBeLessThan(0.8);
    expect(selected.degraded).toBeGreaterThan(0);
  });
});
