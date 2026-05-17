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

    expect(prompt).toContain("图3模特脸图只提供最终可识别脸部身份");
    expect(prompt).toContain("五官大小比例");
    expect(prompt).toContain("图2参考图提供最终摄影基准，并控制最终表情、肤色、妆容");
    expect(prompt).toContain("图2参考图提供最终摄影基准");
    expect(prompt).toContain("图2参考图原来的眼睛、鼻子、嘴巴和脸型不能保留为最终身份特征");
    expect(prompt).toContain("图2参考图的表情运动状态必须保留");
    expect(prompt).toContain("最终脸必须一眼看出来自图3模特脸图");
    expect(prompt).toContain("表情、肤色、妆容、姿态和光影像原本就在图2参考图场景里拍到");
    expect(prompt).toContain("头部大小");
    expect(prompt).toContain("颈肩衔接");
    expect(prompt).toContain("按图2参考图的肤色、妆容和场景光线重新打光");
    expect(prompt).toContain("不是重新生成一个标准棚拍模特");
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

    expect(prompt).toContain("模特脸规则（融合）");
    expect(prompt).toContain("图2参考图提供最终摄影基准");
    expect(prompt).toContain("不要把服装图或图2参考图中的原脸误当成最终身份");
    expect(prompt).toContain("不同图层光影");
  });
});
