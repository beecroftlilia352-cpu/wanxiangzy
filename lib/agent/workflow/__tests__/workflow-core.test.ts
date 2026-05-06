import { describe, expect, it } from "vitest";
import { estimateWorkflowCost } from "@/lib/agent/workflow/cost";
import { orderWorkflowSteps } from "@/lib/agent/workflow/order";
import { planWorkflow } from "@/lib/agent/workflow/planner";
import { WORKFLOW_TOOLS } from "@/lib/agent/workflow/tools";
import { validateWorkflowPlan } from "@/lib/agent/workflow/validator";
import type { GenerationDefaults, WorkflowInputImage } from "@/lib/agent/workflow/types";

const defaults: GenerationDefaults = {
  model: "gpt-image-2",
  aspectRatio: "3:4",
  imageSize: "1K",
  count: 1,
};

const images: WorkflowInputImage[] = [
  { index: 1, url: "https://example.com/person.png", role: "source" },
  { index: 2, url: "https://example.com/clothing.png", role: "clothing" },
];

describe("workflow production core", () => {
  it("orders stored workflow steps by dependencies instead of returned row order", () => {
    const ordered = orderWorkflowSteps([
      { id: "row_pose", step_key: "step_2", depends_on: ["step_1"] },
      { id: "row_tryon", step_key: "step_1", depends_on: [] },
    ]);

    expect(ordered.map((step) => step.step_key)).toEqual(["step_1", "step_2"]);
  });

  it("registers core visual tools and keeps future video disabled", () => {
    expect(WORKFLOW_TOOLS.text_to_image.enabled).toBe(true);
    expect(WORKFLOW_TOOLS.image_to_image.enabled).toBe(true);
    expect(WORKFLOW_TOOLS.tryon.enabled).toBe(true);
    expect(WORKFLOW_TOOLS.pose_variation.enabled).toBe(true);
    expect(WORKFLOW_TOOLS.garment_3d.enabled).toBe(true);
    expect(WORKFLOW_TOOLS.image_to_video.enabled).toBe(false);
  });

  it("fallback planner builds a multi-step tryon and pose workflow", async () => {
    const plan = await planWorkflow({
      userText: "让图1人物穿图2衣服，再生成4个不同站姿",
      images,
      mode: "agent",
      defaults,
    });

    expect(plan.steps.map((step) => step.type)).toEqual(["tryon", "pose_variation"]);
    expect(plan.steps[1].dependsOn).toEqual(["step_1"]);
  });

  it("respects explicit person and clothing image references", async () => {
    const plan = await planWorkflow({
      userText: "图2人物穿图1衣服，然后生成4个不同姿势，每张单独出图",
      images: [
        { index: 1, url: "https://example.com/clothing.png", role: "auto" },
        { index: 2, url: "https://example.com/person.png", role: "auto" },
      ],
      mode: "agent",
      defaults,
    });

    expect(plan.steps.map((step) => step.type)).toEqual(["tryon", "pose_variation"]);
    expect(plan.steps[0].input.personImage).toBe("图2");
    expect(plan.steps[0].input.clothingImage).toBe("图1");
    expect(plan.steps[1].params.outputMode).toBe("separate");
  });

  it("plans commerce detail pages as mobile sections with a stitched long image", async () => {
    const plan = await planWorkflow({
      userText: "生成PDD手机详情页，4张板块，最后拼接成长图",
      images,
      mode: "agent",
      defaults,
    });

    const sections = plan.steps.filter((step) => step.type === "commerce_detail_section");
    expect(sections).toHaveLength(4);
    expect(plan.steps.at(-1)?.type).toBe("commerce_detail_stitch");
    expect(sections[0].params.platform).toBe("pdd");
    expect(sections[0].params.layout).toBe("mobile");
    expect(sections[0].params.aspectRatio).toBe("9:16");
    expect(new Set(sections.map((step) => step.params.sectionTitle))).toHaveLength(4);
  });

  it("asks for visual assets before planning commerce detail pages without images", async () => {
    const plan = await planWorkflow({
      userText: "生成一套电商详情页",
      images: [],
      mode: "agent",
      defaults,
    });

    expect(plan.needsClarification).toBe(true);
    expect(plan.steps).toHaveLength(0);
    expect(plan.clarificationQuestion).toContain("上传");
  });

  it("chains tryon, pose variation, and detail pages through previous visual outputs", async () => {
    const plan = await planWorkflow({
      userText: "图1衣服穿到图2模特上，然后裂变4个姿势，每张单独出图，最后生成PDD手机详情页并拼接长图",
      images: [
        { index: 1, url: "https://example.com/clothing.png", role: "clothing" },
        { index: 2, url: "https://example.com/model.png", role: "reference" },
      ],
      mode: "agent",
      defaults,
    });

    const tryon = plan.steps.find((step) => step.type === "tryon");
    const pose = plan.steps.find((step) => step.type === "pose_variation");
    const firstSection = plan.steps.find((step) => step.type === "commerce_detail_section");
    const stitch = plan.steps.find((step) => step.type === "commerce_detail_stitch");

    expect(tryon).toBeTruthy();
    expect(pose?.dependsOn).toContain(tryon?.id);
    expect(firstSection?.dependsOn).toContain(pose?.id);
    expect(JSON.stringify(firstSection?.input)).toContain(`${pose?.id}.output.imageUrls`);
    expect(plan.steps.filter((step) => step.type === "commerce_detail_section").every((step) => step.dependsOn.includes(String(pose?.id)))).toBe(true);
    expect(stitch?.dependsOn).toEqual(plan.steps.filter((step) => step.type === "commerce_detail_section").map((step) => step.id));
  });

  it("recognizes non-Taobao commerce platforms as detail page workflows", async () => {
    const plan = await planWorkflow({
      userText: "按小红书商品页风格做4张详情板块，也给我拼成长图",
      images,
      mode: "agent",
      defaults,
    });

    expect(plan.steps.filter((step) => step.type === "commerce_detail_section")).toHaveLength(4);
    expect(plan.steps[0].params.platform).toBe("xiaohongshu");
    expect(plan.steps[0].params.layout).toBe("mobile");
    expect(plan.steps.at(-1)?.type).toBe("commerce_detail_stitch");
  });

  it("defaults commerce detail pages to mobile modules unless desktop is explicit", async () => {
    const plan = await planWorkflow({
      userText: "做一套独立站商品详情页，4个模块，拼成长图",
      images,
      mode: "agent",
      defaults,
    });

    const sections = plan.steps.filter((step) => step.type === "commerce_detail_section");
    expect(sections).toHaveLength(4);
    expect(sections.every((step) => step.params.layout === "mobile")).toBe(true);
    expect(sections.every((step) => step.params.count === 1)).toBe(true);
    expect(new Set(sections.map((step) => step.title))).toHaveLength(4);
  });

  it("understands garment transfer wording as tryon before pose variation", async () => {
    const plan = await planWorkflow({
      userText: "帮我把图1的衣服传到图2的模特上，然后再生成4张姿势裂变图",
      images: [
        { index: 1, url: "https://example.com/clothing.png", role: "clothing" },
        { index: 2, url: "https://example.com/model.png", role: "reference" },
      ],
      mode: "agent",
      defaults,
    });

    expect(plan.steps.map((step) => step.type)).toEqual(["tryon", "pose_variation"]);
    expect(plan.steps[0].input.personImage).toBe("图2");
    expect(plan.steps[0].input.clothingImage).toBe("图1");
  });

  it("uses the non-clothing image as model when the user says model without image number", async () => {
    const plan = await planWorkflow({
      userText: "帮我把图1的衣服穿到模特身上，然后裂变4个姿势图",
      images: [
        { index: 1, url: "https://example.com/clothing.png", role: "clothing" },
        { index: 2, url: "https://example.com/model.png", role: "reference" },
      ],
      mode: "agent",
      defaults,
    });

    expect(plan.steps.map((step) => step.type)).toEqual(["tryon", "pose_variation"]);
    expect(plan.steps[0].input.personImage).toBe("图2");
    expect(plan.steps[0].input.clothingImage).toBe("图1");
  });

  it("validator blocks disabled video steps while keeping image workflow valid", async () => {
    const plan = await planWorkflow({
      userText: "图1人物穿图2衣服，再做走秀视频",
      images,
      mode: "agent",
      defaults,
    });
    const result = validateWorkflowPlan({ plan, images, defaults });

    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.code === "TOOL_DISABLED")).toBe(true);
  });

  it("estimates cost per executable workflow step", async () => {
    const plan = await planWorkflow({
      userText: "把这件衣服做成立体3D商品展示图",
      images: [images[1]],
      mode: "agent",
      defaults,
    });
    const estimate = estimateWorkflowCost(plan, defaults);

    expect(estimate.total).toBeGreaterThan(0);
    expect(estimate.steps[0].toolType).toBe("garment_3d");
  });
});
