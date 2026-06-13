import { describe, expect, it } from "vitest";
import {
  buildTryOnFacePrompt,
  enforceTryOnPromptRequirements,
} from "@/lib/tryon-prompt";
import { applyTryOnRequestPrompt, buildTryOnPrompt } from "@/lib/api/lingya";

describe("try-on prompt face integration", () => {
  const lowerBodyNoHeadReference = {
    index: 1,
    bodyCrop: "lower_body" as const,
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
  };

  it("uses source-safe try-on quality without 8K or RAW sharpening terms", () => {
    const prompt = enforceTryOnPromptRequirements(
      "图像角色：图1是服装图，图2是参考图。任务：给图2人物换上图1服装。",
      ["图1", "图2"],
      { hasReference: true, referenceImageNumber: 2 }
    );

    expect(prompt).toContain("图像质量：");
    expect(prompt).toContain("photorealistic natural camera photo");
    expect(prompt).toContain("no extra sharpening");
    expect(prompt).toContain("no moire");
    expect(prompt).not.toContain("8K ultra-detailed");
    expect(prompt).not.toContain("RAW photo quality");
  });

  it("uses the scene reference for head scale, lighting, and skin continuity when a model face is present", () => {
    const prompt = buildTryOnFacePrompt({
      hasReference: true,
      hasModelFace: true,
      referenceImageNumber: 2,
      modelFaceImageNumber: 3,
    });

    expect(prompt).toContain("图3模特脸图是最终脸部身份锚点");
    expect(prompt).toContain("五官大小比例");
    expect(prompt).toContain("图2参考图只作为自然表情、肤色、妆容");
    expect(prompt).toContain("图2参考图原来的眼睛、鼻子、嘴巴和脸型不能保留为最终身份特征");
    expect(prompt).toContain("图2参考图的表情状态要作为完整表演依据");
    expect(prompt).toContain("轻微人脸微调");
    expect(prompt).toContain("自然融合只允许调整表情肌肉、视线、肤色重打光、妆容匹配、毛孔、阴影和边缘融合");
    expect(prompt).toContain("不要为了自然而改动图3模特脸图的脸型轮廓、眼睛形状、眼距、眉形、鼻子结构、嘴部结构、五官比例或身份相似度");
    expect(prompt).toContain("最终脸必须一眼看出来自图3模特脸图本人");
    expect(prompt).toContain("如果不像图3模特脸图，即使服装、姿势或表情正确也算失败");
    expect(prompt).toContain("不能因此压平、移除或重设计图2参考图中真实存在的自然表情");
    expect(prompt).toContain("按图2参考图的肤色、妆容和场景光线重新打光");
    expect(prompt).toContain("图3模特脸图只在身份/相似度/五官结构上优先");
    expect(prompt).toContain("图2参考图在自然表情/肤色/妆容/姿态/比例/光影上优先");
    expect(prompt).toContain("不要证件照式正脸");
    expect(prompt).toContain("贴上去的头");
    expect(prompt).toContain("模板表情脸");
    expect(prompt).toContain("复制图3模特脸图原表情");
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

  it("uses reference facial expression as a natural performance source when both reference and model face are present", () => {
    const { prompt } = buildTryOnPrompt({
      clothingCount: 1,
      clothingMode: "single",
      clothingRoles: ["single"],
      hasReference: true,
      hasModelFace: true,
      referenceAnalysis: {
        index: 1,
        bodyCrop: "upper_body",
        personVisible: true,
        faceVisible: true,
        headVisible: true,
        upperBodyVisible: true,
        lowerBodyVisible: false,
        handsVisible: true,
        feetVisible: false,
        detailFocus: ["face", "upper body"],
        promptNotes: "Use the visible face and upper-body crop.",
        confidence: 0.92,
      },
      aspectRatio: "3:4",
    });

    expect(prompt).toContain("固定底图编辑：以 image 2 作为身体、姿势、构图、光照和场景底图，只把最终脸部身份替换为 image 3");
    expect(prompt).toContain("【HARD 硬规则");
    expect(prompt).toContain("必须使用模特脸");
    expect(prompt).toContain("生成一张与 image 3 无关的新脸");
    expect(prompt).toContain("表情类别、强度、情绪方向、视线、面部张力");
    expect(prompt).toContain("image 2 = 底图与表情 only");
    expect(prompt).toContain("image 3 = 最终脸部身份 only");
    expect(prompt).toContain("不提供表情、肤色、妆容、姿态、身体、服装、光照或背景");
    expect(prompt).toContain("脸部身份规则：");
    expect(prompt).toContain("控制最终脸部身份和五官比例");
    expect(prompt).toContain("不能控制最终脸部身份");
    expect(prompt).toContain("表情肌肉、视线、肤色重新打光、妆容匹配、毛孔、阴影和边缘过渡");
    expect(prompt).toContain("不要改变 image 3 的脸型、眉形、眼距、鼻结构、嘴形、五官比例和可识别度");
    expect(prompt).not.toContain("Face identity lock - HARD:");
    expect(prompt).not.toContain("Expression transfer:");
    expect(prompt).not.toContain("must_use_model_face");
    expect(prompt).not.toContain("preserve_reference_face");
    expect(prompt).not.toContain("facial expression exactly");
    expect(prompt).not.toContain("exact expression geometry");
    expect(prompt).not.toContain("visible expression/skin/makeup when present");
  });

  it("keeps candidate variation away from the face when reference and model face are present", () => {
    const prompt = applyTryOnRequestPrompt("BASE", {
      model: "gpt-image-2",
      candidateIndex: 1,
      candidateCount: 2,
      referenceUrl: "https://example.com/reference.jpg",
      modelFaceUrl: "https://example.com/face.jpg",
      referenceAnalysis: {
        index: 1,
        bodyCrop: "upper_body",
        personVisible: true,
        faceVisible: true,
        headVisible: true,
        upperBodyVisible: true,
        lowerBodyVisible: false,
        handsVisible: true,
        feetVisible: false,
        detailFocus: ["face", "upper body"],
        promptNotes: "Use the visible face and upper-body crop.",
        confidence: 0.92,
      },
    });

    expect(prompt).toContain("候选之间不要改变脸部");
    expect(prompt).toContain("候选差异只能来自服装版型");
    expect(prompt).toContain("套用全局色调前");
    expect(prompt).not.toContain("avoid identical facial expressions");
    expect(prompt).not.toContain("micro-expression");
  });

  it("structures repeated user instructions without amplifying raw duplicate text", () => {
    const { prompt } = buildTryOnPrompt({
      clothingCount: 1,
      clothingMode: "single",
      clothingRoles: ["single"],
      hasReference: true,
      hasModelFace: true,
      referenceAnalysis: {
        index: 1,
        bodyCrop: "full_body",
        personVisible: true,
        faceVisible: true,
        headVisible: true,
        upperBodyVisible: true,
        lowerBodyVisible: true,
        handsVisible: true,
        feetVisible: true,
        detailFocus: ["face", "full body"],
        promptNotes: "Use the visible face and full-body crop.",
        confidence: 0.94,
      },
      aspectRatio: "3:4",
      style: "裙子长度在大腿中间位置，裙子颜色和图一完全一致，模特的脸换成图三的脸，模特的脸换成图三的脸，去除多余文字水印",
    });

    expect(prompt).toContain("User constraints structured from the original request:");
    expect(prompt).toContain("- Clothing constraints:");
    expect(prompt).toContain("- Face identity and integration constraints:");
    expect(prompt).toContain("- Cleanup constraints:");
    expect(prompt).toContain("Apply these constraints within the image-role priorities above");
    expect(prompt.match(/模特的脸换成图三的脸/g) || []).toHaveLength(1);
    expect(prompt).not.toContain("User extra instruction:");
  });

  it("lets an explicit lower upload slot override a conflicting upper visual classification", () => {
    const { prompt } = buildTryOnPrompt({
      clothingCount: 1,
      clothingMode: "multi",
      clothingRoles: ["lower"],
      hasReference: true,
      hasModelFace: false,
      clothingAnalysis: {
        mainCategory: "single_piece_top",
        subcategories: ["single_fitted_top"],
        clothTypeRaw: "upper garment",
        desc: "mistaken upper-body classification from a person image",
        genderType: "women",
        ageRange: "adult",
        slot: "upper",
        fit: "regular",
        confidence: 0.74,
      },
      referenceAnalysis: {
        index: 1,
        bodyCrop: "three_quarter",
        personVisible: true,
        faceVisible: false,
        headVisible: false,
        upperBodyVisible: true,
        lowerBodyVisible: true,
        handsVisible: false,
        feetVisible: true,
        detailFocus: ["lower body"],
        promptNotes: "Use the visible lower-body stance and crop.",
        confidence: 0.86,
      },
      aspectRatio: "3:4",
    });

    expect(prompt).toContain("image 1 = lower clothing source ONLY");
    expect(prompt).toContain("explicit slots=image 1=lower");
    expect(prompt).toContain("User explicit upload slot overrides visual classifier slot=upper");
    expect(prompt).toContain("Treat this as a lower-body garment source");
    expect(prompt).toContain("Replace only lower-body clothing");
    expect(prompt).toContain("image 2 is a no-head/no-face target frame");
    expect(prompt).toContain("do not add a new face, head, or hair outside the original crop");
    expect(prompt).not.toContain("Replace only upper/outer clothing");
    expect(prompt).not.toContain("Preserve image 2's original facial identity");
  });

  it("keeps lower-body no-head references from expanding into full-body outputs", () => {
    const { prompt } = buildTryOnPrompt({
      clothingCount: 1,
      clothingMode: "multi",
      clothingRoles: ["lower"],
      hasReference: true,
      hasModelFace: true,
      referenceAnalysis: lowerBodyNoHeadReference,
      aspectRatio: "3:4",
    });

    expect(prompt).toContain("Head/face absence lock - HARD:");
    expect(prompt).toContain("image 2 is a lower-body-only target frame with no visible head or face");
    expect(prompt).toContain("ignore image 3 completely for this no-head crop");
    expect(prompt).toContain("A result with any visible face or newly added head is invalid");
    expect(prompt).toContain("【HARD 硬规则");
    expect(prompt).toContain("保留参考图原脸");
    expect(prompt).toContain("脸部保留规则：");
    expect(prompt).toContain("禁止生成新脸");
    expect(prompt).toContain("禁止把 image 3 的身份引入裁切之外的区域");
    expect(prompt).not.toContain("Reconstruct the final face");
    expect(prompt).not.toContain("Every generated candidate must use image 3's identity");
    expect(prompt).not.toContain("最终脸部身份 only");
    expect(prompt).not.toContain("must_use_model_face");
    expect(prompt).not.toContain("preserve_reference_face");
  });

  it("keeps lower-body no-head references faceless even without a model face upload", () => {
    const { prompt } = buildTryOnPrompt({
      clothingCount: 1,
      clothingMode: "multi",
      clothingRoles: ["lower"],
      hasReference: true,
      hasModelFace: false,
      referenceAnalysis: lowerBodyNoHeadReference,
      aspectRatio: "3:4",
    });

    expect(prompt).toContain("Head/face absence lock - HARD:");
    expect(prompt).toContain("image 2 is a lower-body-only target frame with no visible head or face");
    expect(prompt).toContain("do not invent a default face or complete person");
    expect(prompt).toContain("A result with any visible face or newly added head is invalid");
    expect(prompt).toContain("Do not reveal upper-body areas, head, or face outside the original crop");
    expect(prompt).not.toContain("Face identity integration:");
    expect(prompt).not.toContain("mandatory face identity reference");
  });
});
