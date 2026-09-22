import { describe, expect, it } from "vitest";

import {
  DEFAULT_DEPLOYMENT_BURST,
  DEFAULT_DEPLOYMENT_MAX_CONCURRENCY,
  DEFAULT_DEPLOYMENT_REQUESTS_PER_MINUTE,
  createDefaultAiControlPlaneConfig,
  validateAiControlPlaneConfig,
} from "@/lib/ai-control-plane/config";
import type { AiControlPlaneConfig } from "@/lib/ai-control-plane/types";

function addBananaDeployment(config: AiControlPlaneConfig, suffix = "primary") {
  config.models[0].enabled = true;
  config.providers.push({
    id: `image-${suffix}`,
    name: `Image ${suffix}`,
    baseUrl: `https://${suffix}.provider.example`,
    apiKey: "encrypted:test-key",
    enabled: true,
    timeoutMs: 120_000,
    capacityMaxConcurrency: 24,
    capacityRequestsPerMinute: 60,
    capacityBurst: 24,
  });
  config.deployments.push({
    id: `banana2-${suffix}`,
    modelId: "nano-banana-2",
    providerId: `image-${suffix}`,
    upstreamModel: "provider-image-model-code",
    protocol: "gemini-native",
    enabled: true,
    priority: 10,
    weight: 100,
    maxConcurrency: 24,
    requestsPerMinute: 60,
    burst: 24,
    capabilities: ["generation", "edit"],
    qualityScore: 0.8,
  });
}

describe("AI control-plane configuration", () => {
  it("ships an unconfigured provider baseline with safe capacity defaults", () => {
    const config = createDefaultAiControlPlaneConfig();
    expect(config.providers).toEqual([]);
    expect(config.deployments).toEqual([]);
    expect(config.models.filter((model) => model.modality === "image").every((model) => !model.enabled)).toBe(true);
    expect(DEFAULT_DEPLOYMENT_MAX_CONCURRENCY).toBe(24);
    expect(DEFAULT_DEPLOYMENT_REQUESTS_PER_MINUTE).toBe(60);
    expect(DEFAULT_DEPLOYMENT_BURST).toBe(24);
    expect(config.policy.leaseTtlSeconds).toBe(60);
    expect(config.policy.maxAttempts).toBe(2);
  });

  it("caps legacy routing policies at two supplier deployments", () => {
    const config = createDefaultAiControlPlaneConfig();
    config.policy.maxAttempts = 10;
    expect(validateAiControlPlaneConfig(config).config.policy.maxAttempts).toBe(2);
  });

  it("clamps legacy long provider leases so crashed workers release capacity quickly", () => {
    const config = createDefaultAiControlPlaneConfig();
    config.policy.leaseTtlSeconds = 30 * 60;
    const result = validateAiControlPlaneConfig(config);
    expect(result.config.policy.leaseTtlSeconds).toBe(120);
  });

  it("accepts a valid multi-provider priority pool", () => {
    const config = createDefaultAiControlPlaneConfig();
    addBananaDeployment(config, "primary");
    addBananaDeployment(config, "backup");
    config.deployments[1].weight = 50;

    const result = validateAiControlPlaneConfig(config);
    expect(result.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    expect(result.config.deployments.filter((item) => item.modelId === "nano-banana-2")).toHaveLength(2);
  });

  it("rejects a user-visible dynamic image model without authoritative pricing", () => {
    const config = createDefaultAiControlPlaneConfig();
    config.models.push({
      id: "qwen-image-3",
      displayName: "Qwen Image 3",
      modality: "image",
      enabled: true,
      userVisible: true,
      capabilities: ["generation", "edit"],
      defaultRoutingMode: "smart",
    });
    addBananaDeployment(config);
    config.deployments.push({
      ...config.deployments[0],
      id: "qwen-image-3-primary",
      modelId: "qwen-image-3",
      upstreamModel: "qwen-image-3",
      protocol: "openai-image",
    });

    const result = validateAiControlPlaneConfig(config);
    expect(result.issues).toContainEqual(expect.objectContaining({
      path: expect.stringContaining("creditPrices"),
      severity: "error",
    }));
  });

  it("rejects protocols that cannot execute a model modality", () => {
    const config = createDefaultAiControlPlaneConfig();
    addBananaDeployment(config);
    config.deployments[0] = { ...config.deployments[0], protocol: "openai-chat" };
    const result = validateAiControlPlaneConfig(config);
    expect(result.issues).toContainEqual(expect.objectContaining({
      path: "deployments.0.protocol",
      severity: "error",
    }));
  });

  it("preserves model presentation metadata and safe adapter overrides", () => {
    const config = createDefaultAiControlPlaneConfig();
    addBananaDeployment(config);
    config.models[0].presentation = {
      shortTitle: "香蕉 2",
      badge: "推荐",
      iconUrl: "https://cdn.example.com/banana-2.png",
      coverUrl: "https://cdn.example.com/banana-2-cover.webp",
      group: "通用绘图",
      tags: ["快速", "编辑"],
      sortOrder: 10,
      featured: true,
      locales: { en: { title: "Nano Banana 2", description: "Fast image generation" } },
    };
    config.deployments[0].adapterConfig = {
      generationPath: "/v1beta/models/{model}:generateContent",
      staticParameters: { vendor_flag: true },
    };
    const result = validateAiControlPlaneConfig(config);
    expect(result.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    expect(result.config.models[0].presentation?.locales?.en?.title).toBe("Nano Banana 2");
    expect(result.config.deployments[0].adapterConfig?.staticParameters).toEqual({ vendor_flag: true });
  });

  it("rejects unsafe adapter paths and non-HTTPS catalog images", () => {
    const config = createDefaultAiControlPlaneConfig();
    addBananaDeployment(config);
    config.models[0].presentation = { iconUrl: "javascript:alert(1)" };
    config.deployments[0].adapterConfig = { generationPath: "https://attacker.invalid/capture" };
    const result = validateAiControlPlaneConfig(config);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "models.0.presentation.iconUrl", severity: "error" }),
      expect.objectContaining({ path: "deployments.0.adapterConfig.generationPath", severity: "error" }),
    ]));
  });

  it("allows the kie.ai job protocol for image models and keeps its declarative switches", () => {
    const config = createDefaultAiControlPlaneConfig();
    addBananaDeployment(config);
    config.deployments[0] = { ...config.deployments[0], protocol: "kie-job", upstreamModel: "nano-banana-2" };
    config.deployments[0].adapterConfig = {
      editUpstreamModel: "gpt-image-2-image-to-image",
      imageInputField: "image_urls",
      imageSizeField: "none",
    };

    const result = validateAiControlPlaneConfig(config);
    expect(result.issues.filter((issue) => issue.severity === "error")).toEqual([]);
    expect(result.config.deployments[0].adapterConfig).toEqual({
      authMode: undefined,
      generationPath: undefined,
      editPath: undefined,
      statusPath: undefined,
      staticParameters: undefined,
      editUpstreamModel: "gpt-image-2-image-to-image",
      imageInputField: "image_urls",
      imageSizeField: "none",
    });
  });

  it("rejects malformed kie.ai adapter switches instead of dropping them", () => {
    const config = createDefaultAiControlPlaneConfig();
    addBananaDeployment(config);
    config.deployments[0] = { ...config.deployments[0], protocol: "kie-job" };
    config.deployments[0].adapterConfig = {
      editUpstreamModel: "bad model!",
      imageInputField: "input urls",
      imageSizeField: "resolution; drop",
    };

    const result = validateAiControlPlaneConfig(config);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "deployments.0.adapterConfig.editUpstreamModel", severity: "error" }),
      expect.objectContaining({ path: "deployments.0.adapterConfig.imageInputField", severity: "error" }),
      expect.objectContaining({ path: "deployments.0.adapterConfig.imageSizeField", severity: "error" }),
    ]));
  });

  it("ships the six supported image models with positive 1K/2K/4K pricing", () => {
    const config = createDefaultAiControlPlaneConfig();
    const imageModels = config.models.filter((model) => model.modality === "image");
    expect(imageModels.map((model) => model.id)).toEqual([
      "nano-banana-2",
      "nano-banana-2-lite",
      "gpt-image-2",
      "nano-banana-pro",
      "gpt-image-2-5-sunburst",
      "gpt-image-2-5-flare",
    ]);
    for (const model of imageModels) {
      expect(Number(model.creditPrices?.["1K"] || 0)).toBeGreaterThan(0);
      expect(model.presentation?.shortTitle).toBeTruthy();
      // 默认目录是未启用的基线，必须先发布部署。
      expect(model.enabled).toBe(false);
    }
  });
});
