import { describe, expect, it } from "vitest";

import {
  AI_PROTOCOL_ADAPTERS,
  buildAiAdapterAuthHeaders,
  mergeAiAdapterParameters,
  resolveAiAdapterUrl,
} from "@/lib/ai-control-plane/adapters";

describe("AI protocol adapter registry", () => {
  it("resolves only deployment-relative endpoint templates", () => {
    expect(resolveAiAdapterUrl({
      baseUrl: "https://provider.example/v1/",
      protocol: "gemini-native",
      operation: "generation",
      model: "qwen/image",
    })).toBe("https://provider.example/v1/v1beta/models/qwen%2Fimage:generateContent");
    expect(resolveAiAdapterUrl({
      baseUrl: "https://provider.example",
      protocol: "newapi-video",
      operation: "status",
      taskId: "task/1",
    })).toBe("https://provider.example/v1/video/generations/task%2F1");
  });

  it("keeps canonical task fields authoritative over provider static flags", () => {
    expect(mergeAiAdapterParameters(
      { model: "safe-model", prompt: "user prompt", count: 1 },
      { staticParameters: { model: "wrong-model", prompt: "wrong prompt", watermark: false } },
    )).toEqual({ model: "safe-model", prompt: "user prompt", count: 1, watermark: false });
  });

  it("keeps the kie.ai job paths relative to the untouched base URL", () => {
    expect(resolveAiAdapterUrl({
      baseUrl: "https://api.kie.ai/",
      protocol: "kie-job",
      operation: "generation",
    })).toBe("https://api.kie.ai/api/v1/jobs/createTask");
    expect(resolveAiAdapterUrl({
      baseUrl: "https://api.kie.ai",
      protocol: "kie-job",
      operation: "status",
      taskId: "abc123",
    })).toBe("https://api.kie.ai/api/v1/jobs/recordInfo");
    expect(AI_PROTOCOL_ADAPTERS["kie-job"].defaultPaths.edit).toBeUndefined();
  });

  it("registers a documented adapter for every exposed protocol", () => {
    expect(Object.keys(AI_PROTOCOL_ADAPTERS).sort()).toEqual([
      "gemini-native",
      "kie-job",
      "newapi-video",
      "openai-chat",
      "openai-image",
    ]);
    expect(AI_PROTOCOL_ADAPTERS["kie-job"].modalities).toEqual(["image"]);
    expect(AI_PROTOCOL_ADAPTERS["kie-job"].defaultAuthMode).toBe("bearer");
  });

  it("authenticates kie.ai jobs with the bearer profile", () => {
    expect(buildAiAdapterAuthHeaders({ protocol: "kie-job", apiKey: "placeholder-key" }))
      .toEqual({ Authorization: "Bearer placeholder-key" });
  });

  it("supports only explicit non-script authentication profiles", () => {
    expect(buildAiAdapterAuthHeaders({ protocol: "gemini-native", apiKey: "secret" })).toEqual({ "x-goog-api-key": "secret" });
    expect(buildAiAdapterAuthHeaders({ protocol: "openai-image", apiKey: "secret", adapterConfig: { authMode: "x-api-key" } })).toEqual({ "x-api-key": "secret" });
  });
});
