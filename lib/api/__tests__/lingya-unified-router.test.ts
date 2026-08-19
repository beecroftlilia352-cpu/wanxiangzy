import { beforeEach, describe, expect, it, vi } from "vitest";

const { executeAiRouted } = vi.hoisted(() => ({ executeAiRouted: vi.fn() }));
vi.mock("@/lib/ai-control-plane/router.server", () => ({ executeAiRouted }));

import { generateImageWithControlPlane as generateImage } from "@/lib/api/lingya-routing.server";

describe("image unified model routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executeAiRouted.mockResolvedValue({ url: "https://media.example/result.png" });
  });

  it("routes generation through the unified control plane", async () => {
    await generateImage({
      model: "nano-banana-2",
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
});
