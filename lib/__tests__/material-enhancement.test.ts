import { describe, expect, it } from "vitest";
import {
  buildMaterialEnhancementPrompt,
  enforceMaterialEnhancementPromptRequirements,
  normalizeMaterialEnhancementLevel,
} from "@/lib/material-enhancement";

describe("material enhancement prompt", () => {
  it("defines strict image roles and an edit boundary for commercial garment detail enhancement", () => {
    const prompt = buildMaterialEnhancementPrompt({
      garmentType: "上装",
      enhancementLevel: "fine_detail",
      userPrompt: "重点增强针织纹理和纽扣边缘。",
    });

    expect(prompt).toContain("图1是最终画面原图");
    expect(prompt).toContain("图2是同款或同系列服装高清商品图");
    expect(prompt).toContain("只处理图1目标服装可见区域");
    expect(prompt).toContain("不要改变人物身份、脸、皮肤、发型、身体比例、姿势、背景");
    expect(prompt).toContain("图1决定服装在人物身上的版型、轮廓、褶皱、垂坠、遮挡和阴影");
    expect(prompt).toContain("图2只用于补足面料织法、纹理方向、缝线");
    expect(prompt).toContain("细节优先");
    expect(prompt).toContain("source-matched garment material enhancement");
    expect(prompt).toContain("细密纹理安全");
    expect(prompt).toContain("摩尔纹");
    expect(prompt).not.toContain("8K ultra-detailed");
    expect(prompt).not.toContain("RAW photo quality");
    expect(prompt).toContain("重点增强针织纹理和纽扣边缘");
  });

  it("wraps custom prompts with the required material enhancement guardrails", () => {
    const prompt = enforceMaterialEnhancementPromptRequirements("让衣服细节更清楚。", {
      garmentType: "下装",
      enhancementLevel: "balanced",
    });

    expect(prompt).toContain("图像角色：图1是最终画面原图");
    expect(prompt).toContain("任务：对图1中可见的下装区域做商用级材质增强");
    expect(prompt).toContain("补充执行要求：让衣服细节更清楚。");
  });

  it("normalizes unsupported enhancement levels to the default", () => {
    expect(normalizeMaterialEnhancementLevel("fine_detail")).toBe("fine_detail");
    expect(normalizeMaterialEnhancementLevel("unknown")).toBe("balanced");
  });
});
