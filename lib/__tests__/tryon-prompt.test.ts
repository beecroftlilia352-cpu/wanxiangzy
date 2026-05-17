import { describe, expect, it } from "vitest";
import {
  buildTryOnFacePrompt,
  enforceTryOnPromptRequirements,
} from "@/lib/tryon-prompt";

describe("try-on prompt face integration", () => {
  it("uses the scene reference for head scale, lighting, and skin continuity when a model face is present", () => {
    const prompt = buildTryOnFacePrompt({
      hasReference: true,
      hasModelFace: true,
      referenceImageNumber: 2,
      modelFaceImageNumber: 3,
    });

    expect(prompt).toContain("图3模特脸图只提供最终脸部身份");
    expect(prompt).toContain("图2参考图是最终人物的头部姿态和身体融合基准");
    expect(prompt).toContain("头部大小");
    expect(prompt).toContain("颈肩衔接");
    expect(prompt).toContain("皮肤冷暖调");
    expect(prompt).toContain("不要证件照式正脸");
    expect(prompt).toContain("贴上去的头");
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

    expect(prompt).toContain("模特脸规则（融合）");
    expect(prompt).toContain("图2参考图是最终人物的头部姿态和身体融合基准");
    expect(prompt).toContain("不同图层光影");
  });
});
