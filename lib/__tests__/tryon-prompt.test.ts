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
    expect(prompt).toContain("图2参考图的表情线索要作为自然表演依据");
    expect(prompt).toContain("最终脸必须一眼看出来自图3模特脸图本人");
    expect(prompt).toContain("如果不像图3模特脸图，即使服装、姿势或表情正确也算失败");
    expect(prompt).toContain("让图3模特脸图这个人自然做出图2参考图的表情状态");
    expect(prompt).toContain("按图2参考图的肤色、妆容和场景光线重新打光");
    expect(prompt).toContain("图3模特脸图只在身份/相似度/五官结构上优先");
    expect(prompt).toContain("图2参考图在自然表情/肤色/妆容/姿态/比例/光影上优先");
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

    expect(prompt).toContain("Expression transfer:");
    expect(prompt).toContain("image 2 is the expression performance source");
    expect(prompt).toContain("image 3 is not an expression source");
    expect(prompt).toContain("use image 2's smile strength as the guide, not image 3's original smile");
    expect(prompt).toContain("real person naturally making image 2's expression");
    expect(prompt).toContain("image 2 = target expression and try-on reference: natural facial expression direction and strength");
    expect(prompt).toContain("image 3 = mandatory face identity reference only");
    expect(prompt).toContain("do not copy its original expression, smile intensity, skin tone, makeup");
    expect(prompt).toContain("image 2 controls the final face's natural expression direction and strength");
    expect(prompt).toContain("image 3 controls final facial identity and feature proportions");
    expect(prompt).toContain("subtle human micro-adjustments");
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

    expect(prompt).toContain("Do not vary the face, facial expression, gaze, head pose, head scale");
    expect(prompt).toContain("candidate diversity must come from garment fit");
    expect(prompt).toContain("Before applying the global color mood");
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
    expect(prompt).toContain("does not provide a visible head/face target");
    expect(prompt).toContain("Do not zoom out, add a head, add a face");
    expect(prompt).toContain("Preserving the reference crop is higher priority than showing face identity");
    expect(prompt).not.toContain("Reconstruct the final face");
    expect(prompt).not.toContain("Every generated candidate must use image 3's identity");
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
