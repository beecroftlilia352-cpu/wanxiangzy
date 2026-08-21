import { describe, expect, it } from "vitest";

import {
  createDefaultAiControlPlaneConfig,
  validateAiControlPlaneConfig,
} from "@/lib/ai-control-plane/config";

describe("AI control-plane configuration", () => {
  it("ships a production-scale image pool baseline instead of saturating at four jobs", () => {
    const config = createDefaultAiControlPlaneConfig();
    const imageDeployments = config.deployments.filter((deployment) =>
      config.models.find((model) => model.id === deployment.modelId)?.modality === "image"
    );
    expect(imageDeployments.length).toBeGreaterThan(0);
    expect(imageDeployments.every((deployment) => deployment.maxConcurrency === 24)).toBe(true);
    expect(imageDeployments.every((deployment) => deployment.requestsPerMinute === 60)).toBe(true);
    expect(imageDeployments.every((deployment) => deployment.burst === 24)).toBe(true);
    expect(config.policy.leaseTtlSeconds).toBe(60);
  });

  it("clamps legacy long provider leases so crashed workers release capacity quickly", () => {
    const config = createDefaultAiControlPlaneConfig();
    config.policy.leaseTtlSeconds = 30 * 60;
    const result = validateAiControlPlaneConfig(config);
    expect(result.config.policy.leaseTtlSeconds).toBe(120);
  });

  it("accepts a valid multi-provider priority pool", () => {
    const config = createDefaultAiControlPlaneConfig();
    config.providers.push({
      id: "backup-image",
      name: "Backup",
      baseUrl: "https://example.com/v1",
      apiKey: "env:BACKUP_IMAGE_KEY",
      enabled: true,
      timeoutMs: 120_000,
    });
    config.deployments.push({
      ...config.deployments[0],
      id: "banana2-backup",
      providerId: "backup-image",
      priority: config.deployments[0].priority,
      weight: 50,
    });

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
    config.deployments[0] = { ...config.deployments[0], protocol: "openai-chat" };
    const result = validateAiControlPlaneConfig(config);
    expect(result.issues).toContainEqual(expect.objectContaining({
      path: "deployments.0.protocol",
      severity: "error",
    }));
  });

  it("preserves model presentation metadata and safe adapter overrides", () => {
    const config = createDefaultAiControlPlaneConfig();
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
    config.models[0].presentation = { iconUrl: "javascript:alert(1)" };
    config.deployments[0].adapterConfig = { generationPath: "https://attacker.invalid/capture" };
    const result = validateAiControlPlaneConfig(config);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "models.0.presentation.iconUrl", severity: "error" }),
      expect.objectContaining({ path: "deployments.0.adapterConfig.generationPath", severity: "error" }),
    ]));
  });
});
