import { beforeEach, describe, expect, it, vi } from "vitest";

const { executeAiRouted, upstreamGenerateImage } = vi.hoisted(() => ({ executeAiRouted: vi.fn(), upstreamGenerateImage: vi.fn() }));
vi.mock("@/lib/ai-control-plane/router.server", () => ({ executeAiRouted }));
vi.mock("@/lib/api/lingya", () => ({ generateImage: upstreamGenerateImage }));

import { generateImageWithControlPlane as generateImage } from "@/lib/api/lingya-routing.server";
import { runWithAiRouteContext } from "@/lib/ai-control-plane/context.server";

describe("image unified model routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executeAiRouted.mockResolvedValue({ url: "https://media.example/result.png" });
    upstreamGenerateImage.mockResolvedValue({ url: "https://media.example/result.png" });
  });

  it("routes generation through the unified control plane", async () => {
    await generateImage({
      model: "nano-banana-2" as const,
      prompt: "studio product image",
      aspect_ratio: "1:1",
      image_size: "1K",
    });
    expect(executeAiRouted).toHaveBeenCalledWith(expect.objectContaining({
      modelId: "nano-banana-2",
      modality: "image",
      context: { requiredCapabilities: ["generation"] },
    }));
  });

  it("requires edit capability when reference images are present", async () => {
    await generateImage({
      model: "gpt-image-2",
      prompt: "edit product image",
      aspect_ratio: "1:1",
      image_size: "1K",
      image: ["https://media.example/source.png"],
    });
    expect(executeAiRouted.mock.calls[0][0].context.requiredCapabilities).toEqual(["edit"]);
  });

  it("uses a distinct stable idempotency key for each logical batch slot", async () => {
    executeAiRouted.mockImplementation(async (route: { execute: (deployment: Record<string, unknown>) => Promise<unknown> }) =>
      route.execute({}));
    const input = {
      model: "nano-banana-2" as const,
      prompt: "same prompt",
      aspect_ratio: "1:1" as const,
      image_size: "1K" as const,
    };
    await runWithAiRouteContext({ generationId: "10000000-0000-4000-8000-000000000001", slotIndex: 0 }, () => generateImage(input));
    await runWithAiRouteContext({ generationId: "10000000-0000-4000-8000-000000000001", slotIndex: 1 }, () => generateImage(input));
    expect(upstreamGenerateImage.mock.calls[0][0].idempotencyKey).not.toBe(upstreamGenerateImage.mock.calls[1][0].idempotencyKey);
  });
});
