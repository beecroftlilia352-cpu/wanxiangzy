import { describe, expect, it } from "vitest";
import { critiqueWorkflowPlan } from "@/lib/agent/brain/critic";
import type { GenerationDefaults, WorkflowInputImage, WorkflowPlan } from "@/lib/agent/workflow/types";

const defaults: GenerationDefaults = {
  model: "gpt-image-2",
  aspectRatio: "3:4",
  imageSize: "1K",
  count: 1,
};

const images: WorkflowInputImage[] = [
  { index: 1, url: "https://example.com/product.jpg", role: "source" },
];

function planWithStep(type: WorkflowPlan["steps"][number]["type"]): WorkflowPlan {
  return {
    intent: type,
    summary: type,
    confidence: 0.7,
    needsClarification: false,
    imageRoles: [],
    userConstraints: [],
    assumptions: [],
    steps: [{
      id: "step_1",
      type,
      title: type,
      dependsOn: [],
      input: { referenceImages: ["图1"] },
      params: { prompt: "test" },
      expectedOutput: { imageUrls: true },
      riskNotes: [],
    }],
  };
}

describe("workflow plan critic", () => {
  it("repairs Taobao detail page plans that are not commerce_detail", async () => {
    const critique = await critiqueWorkflowPlan({
      userText: "根据这张图生成淘宝详情页",
      images,
      defaults,
      plan: planWithStep("commerce_creative"),
    });

    expect(critique.repairedPlan?.steps[0].type).toBe("commerce_detail");
    expect(critique.issues.map((issue) => issue.code)).toContain("COMMERCE_DETAIL_MISROUTE");
  });

  it("repairs separate pose output mode", async () => {
    const plan = planWithStep("pose_variation");
    plan.steps[0].params = { outputMode: "grid" };
    const critique = await critiqueWorkflowPlan({
      userText: "生成4个不同姿势，每张单独出图",
      images,
      defaults,
      plan,
    });

    expect(critique.repairedPlan?.steps[0].params.outputMode).toBe("separate");
  });

  it("blocks video plans while video worker is reserved", async () => {
    const plan = planWithStep("image_to_video");
    const critique = await critiqueWorkflowPlan({
      userText: "把这张图做成走秀视频",
      images,
      defaults,
      plan,
    });

    expect(critique.ok).toBe(false);
    expect(critique.repairedPlan?.needsClarification).toBe(true);
    expect(critique.issues.map((issue) => issue.code)).toContain("VIDEO_RESERVED");
  });
});

