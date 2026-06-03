import { describe, expect, it } from "vitest";
import {
  buildTryOnFacePrompt,
  enforceTryOnPromptRequirements,
} from "@/lib/tryon-prompt";
import { buildTryOnPrompt } from "@/lib/api/lingya";

describe("try-on prompt face integration", () => {
  it("uses the scene reference for head scale, lighting, and skin continuity when a model face is present", () => {
    const prompt = buildTryOnFacePrompt({
      hasReference: true,
      hasModelFace: true,
      referenceImageNumber: 2,
      modelFaceImageNumber: 3,
    });

    expect(prompt).toContain("图3模特脸图是最终脸部身份锚点");
    expect(prompt).toContain("五官大小比例");
    expect(prompt).toContain("图2参考图只作为表情、肤色、妆容");
    expect(prompt).toContain("图2参考图原来的眼睛、鼻子、嘴巴和脸型不能保留为最终身份特征");
    expect(prompt).toContain("图2参考图的表情运动状态必须保留");
    expect(prompt).toContain("最终脸必须一眼看出来自图3模特脸图本人");
    expect(prompt).toContain("如果不像图3模特脸图，即使服装、姿势或表情正确也算失败");
    expect(prompt).toContain("让图3模特脸图这个人做出图2参考图的表情");
    expect(prompt).toContain("按图2参考图的肤色、妆容和场景光线重新打光");
    expect(prompt).toContain("图3模特脸图只在身份/相似度/五官结构上优先");
    expect(prompt).toContain("图2参考图在表情/肤色/妆容/姿态/比例/光影上优先");
    expect(prompt).toContain("不要证件照式正脸");
    expect(prompt).toContain("贴上去的头");
    expect(prompt).toContain("假笑模板脸");
    expect(prompt).toContain("复制图3模特脸图笑容");
    expect(prompt).toContain("复制图3模特脸图肤色");
    expect(prompt).toContain("复制图3模特脸图妆容");
  });

  it("repairs optimized try-on prompts with the face integration rule", () => {
    const prompt = enforceTryOnPromptRequirements(
      "图像角色：图1是服装图，图2是参考图，图3是模特脸图。任务：给图2人物换上图1服装并使用图3模特脸。",
      ["图1", "图2", "图3"],
      {
        hasReference: true,
        hasModelFace: true,
        referenceImageNumber: 2,
        modelFaceImageNumber: 3,
      }
    );

    expect(prompt).toContain("模特脸规则（身份迁移）");
    expect(prompt).toContain("图3模特脸图是最终脸部身份锚点");
    expect(prompt).toContain("保留图2参考图原脸身份");
    expect(prompt).toContain("不同图层光影");
  });

  it("keeps lower-body no-head references from expanding into full-body outputs", () => {
    const { prompt } = buildTryOnPrompt({
      clothingCount: 1,
      clothingMode: "multi",
      clothingRoles: ["lower"],
      hasReference: true,
      hasModelFace: true,
      referenceAnalysis: {
        index: 1,
        bodyCrop: "lower_body",
        personVisible: true,
        faceVisible: false,
        headVisible: false,
        upperBodyVisible: false,
        lowerBodyVisible: true,
        handsVisible: false,
        feetVisible: true,
        detailFocus: ["pants", "leg stance"],
        promptNotes: "Keep the waist-to-feet crop and do not add a head, face, shoulders, or full torso.",
        confidence: 0.95,
      },
      aspectRatio: "3:4",
    });

    expect(prompt).toContain("does not provide a visible head/face target");
    expect(prompt).toContain("Do not zoom out, add a head, add a face");
    expect(prompt).toContain("Preserving the reference crop is higher priority than showing face identity");
    expect(prompt).not.toContain("Reconstruct the final face");
    expect(prompt).not.toContain("Every generated candidate must use image 3's identity");
  });
});
