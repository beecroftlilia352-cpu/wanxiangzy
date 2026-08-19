import { beforeEach, describe, expect, it, vi } from "vitest";

const { executeAiRouted, generateNewApiImageToVideo } = vi.hoisted(() => ({
  executeAiRouted: vi.fn(),
  generateNewApiImageToVideo: vi.fn(),
}));

vi.mock("@/lib/ai-control-plane/router.server", () => ({ executeAiRouted }));
vi.mock("@/lib/ai-control-plane/server", () => ({ getAiControlPlaneConfig: vi.fn() }));
vi.mock("@/lib/api/newapi-video", () => ({
  generateNewApiImageToVideo,
  generateNewApiMotionControl: vi.fn(),
  generateNewApiFirstLastFrame: vi.fn(),
}));

import { generateVideoImageToVideo } from "@/lib/api/video-provider";

const deployment = {
  id: "video-minimax-primary",
  modelId: "video-minimax",
  providerId: "gateway-a",
  upstreamModel: "minimax-h3",
  protocol: "newapi-video" as const,
  enabled: true,
  priority: 10,
  weight: 100,
  maxConcurrency: 8,
  requestsPerMinute: 120,
  burst: 8,
  provider: { id: "gateway-a", name: "Gateway A", baseUrl: "https://video.example/v1", enabled: true, timeoutMs: 1_200_000 },
  apiKey: "test-key",
  health: { deploymentId: "video-minimax-primary", circuitState: "closed" as const, consecutiveFailures: 0, sampleCount: 1, ewmaSuccessRate: 1, ewmaLatencyMs: 1000 },
  score: 1,
  selectionReason: {},
};

describe("unified video provider routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executeAiRouted.mockImplementation(async (input) => input.execute(deployment, 1));
    generateNewApiImageToVideo.mockResolvedValue({
      url: "https://media.example/video.mp4",
      urls: ["https://media.example/video.mp4"],
      taskId: "task-1",
      providerStatus: "completed",
      prompt: "move",
      compiledPrompt: "move",
    });
  });

  it("routes by logical video model and records the selected deployment in progress", async () => {
    const onProgress = vi.fn();
    await generateVideoImageToVideo({
      provider: "minimax",
      imageUrl: "https://media.example/input.jpg",
      prompt: "move",
      modelMode: "pro",
      duration: 5,
      resolution: "768p",
      aspectRatio: "16:9",
      audioMode: "generated",
      generateAudio: true,
      onProgress,
    });

    const route = executeAiRouted.mock.calls[0][0];
    expect(route).toMatchObject({ modelId: "video-minimax", modality: "video" });
    expect(route.context.requiredCapabilities).toEqual(["image-to-video"]);
    const routedInput = generateNewApiImageToVideo.mock.calls[0][0];
    await routedInput.onProgress({ taskId: "task-1", status: "queued", progress: 10 });
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      providerDetails: expect.objectContaining({ deploymentId: "video-minimax-primary", providerId: "gateway-a" }),
    }));
    expect(generateNewApiImageToVideo.mock.calls[0][1]).toMatchObject({ provider: "minimax", apiBase: "https://video.example" });
    expect(route.canFailover(new Error("network"), deployment, 1)).toBe(false);
  });

  it("pins a resumed upstream task to its original deployment", async () => {
    await generateVideoImageToVideo({
      provider: "minimax",
      imageUrl: "https://media.example/input.jpg",
      prompt: "move",
      modelMode: "pro",
      duration: 5,
      resolution: "768p",
      aspectRatio: "16:9",
      audioMode: "generated",
      generateAudio: true,
      resumeTask: { taskId: "task-1", deploymentId: "video-minimax-primary" },
    });
    expect(executeAiRouted.mock.calls[0][0].context.requiredDeploymentId).toBe("video-minimax-primary");
  });
});
