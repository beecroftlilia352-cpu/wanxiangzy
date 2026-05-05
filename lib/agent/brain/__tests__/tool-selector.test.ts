import { describe, expect, it } from "vitest";
import { createBrainTrace } from "@/lib/agent/brain/trace";
import { selectCandidateTools } from "@/lib/agent/brain/tool-selector";

describe("dynamic tool selector", () => {
  it("prioritizes commerce detail for Taobao detail page requests", () => {
    const candidates = selectCandidateTools({
      trace: createBrainTrace(),
      imageUnderstanding: null,
      request: {
        userText: "根据这张图生成淘宝详情页",
        images: [{ index: 1, url: "https://example.com/a.jpg", role: "source" }],
        intentMode: "smart",
      },
    });

    expect(candidates[0]?.type).toBe("commerce_detail");
  });

  it("keeps video as a high-scoring but disabled reserved tool", () => {
    const candidates = selectCandidateTools({
      trace: createBrainTrace(),
      imageUnderstanding: null,
      request: {
        userText: "把图1做成走秀视频",
        images: [{ index: 1, url: "https://example.com/a.jpg", role: "source" }],
        intentMode: "smart",
      },
    });

    const video = candidates.find((candidate) => candidate.type === "image_to_video");
    expect(video?.enabled).toBe(false);
    expect(video?.score).toBeGreaterThan(0.7);
  });
});
