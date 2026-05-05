import { describe, expect, it } from "vitest";
import { buildKnowledgePrompt } from "@/lib/agent/brain/knowledge";

describe("agent knowledge prompt", () => {
  it("renders brand and project knowledge compactly", () => {
    const prompt = buildKnowledgePrompt([
      {
        scope: "brand",
        title: "品牌调性",
        content: "轻奢、克制、不要小红书风。",
        tags: ["lookbook"],
      },
    ]);

    expect(prompt).toContain("品牌调性");
    expect(prompt).toContain("轻奢");
  });
});
