import { describe, expect, it } from "vitest";
import {
  buildGrassPrompt,
  enforceGrassPromptRequirements,
  normalizeGrassSceneBackgroundMode,
} from "@/lib/grass-planting";

describe("grass scene background control", () => {
  it("defaults unknown background modes to the existing reference-scene behavior", () => {
    expect(normalizeGrassSceneBackgroundMode(undefined)).toBe("reference_scene");
    expect(normalizeGrassSceneBackgroundMode("")).toBe("reference_scene");
    expect(normalizeGrassSceneBackgroundMode("similar_style")).toBe("similar_style");
  });

  it("adds a similar-style scene rule without asking the model to copy the background", () => {
    const prompt = buildGrassPrompt({
      templateId: "street",
      userPrompt: "",
      changeModel: true,
      sceneMode: "upload_reference",
      hasReference: true,
      referenceName: "用户参考图",
      sceneBackgroundMode: "similar_style",
    });

    expect(prompt).toContain("同风格、同氛围、同拍摄语言的相似场景");
    expect(prompt).toContain("保留图2的滤镜观感");
    expect(prompt).toContain("明暗反差");
    expect(prompt).toContain("不要一比一复刻图2背景");
    expect(prompt).toContain("不要复刻图2的具体地点");
    expect(prompt).toContain("可识别版权元素");
    expect(prompt).toContain("服装和穿搭只来自图1");
  });

  it("repairs optimized prompts with the similar-style anti-copy rule", () => {
    const prompt = enforceGrassPromptRequirements("生成种草图", {
      sceneMode: "upload_reference",
      hasReference: true,
      changeModel: true,
      sceneBackgroundMode: "similar_style",
    });

    expect(prompt).toContain("图2只作为场景风格参考");
    expect(prompt).toContain("AI 必须重新生成同类但不同的背景场景");
    expect(prompt).toContain("不要复刻图2的具体地点");
  });

  it("keeps garment quality as product fidelity instead of texture enhancement", () => {
    const prompt = buildGrassPrompt({
      templateId: "street",
      userPrompt: "",
      changeModel: true,
      sceneMode: "system_reference",
      hasReference: true,
      referenceName: "街拍参考",
      sceneBackgroundMode: "reference_scene",
    });

    expect(prompt).toContain("服装产品保真");
    expect(prompt).toContain("图1服装按商品资产处理");
    expect(prompt).toContain("场景氛围、滤镜和社媒风格不能重绘服装材质");
    expect(prompt).toContain("源图主体保真");
    expect(prompt).toContain("曝光反差");
    expect(prompt).toContain("细密纹理安全");
    expect(prompt).toContain("true-to-source garment rendering");
    expect(prompt).not.toContain("8K ultra-detailed");
    expect(prompt).not.toContain("RAW photo quality");
    expect(prompt).not.toContain("realistic fabric texture");
    expect(prompt).not.toContain("clean color grading");
  });
});
