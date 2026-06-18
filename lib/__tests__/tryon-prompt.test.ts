import { describe, expect, it } from "vitest";
import {
  buildTryOnFacePrompt,
  enforceTryOnPromptRequirements,
} from "@/lib/tryon-prompt";
import {
  applyTryOnRequestPrompt,
  buildTryOnImageInputsForRequest,
  buildTryOnPrompt,
  normalizeTryOnRawPromptImageReferences,
} from "@/lib/api/lingya";

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

  it("sends reference image first only when a target reference exists", () => {
    expect(buildTryOnImageInputsForRequest({
      clothingUrls: ["cloth-upper.jpg", "cloth-lower.jpg"],
      referenceUrl: "target.jpg",
      modelFaceUrl: "face.jpg",
      garmentDetailUrls: ["detail.jpg"],
    })).toEqual(["target.jpg", "cloth-upper.jpg", "cloth-lower.jpg", "face.jpg", "detail.jpg"]);

    expect(buildTryOnImageInputsForRequest({
      clothingUrls: ["cloth.jpg"],
      modelFaceUrl: "face.jpg",
      garmentDetailUrls: ["detail.jpg"],
    })).toEqual(["cloth.jpg", "face.jpg", "detail.jpg"]);
  });

  it("remaps legacy raw prompt numbering only when it detects old role order", () => {
    const params = { clothingCount: 1, hasReference: true, hasModelFace: true };

    expect(normalizeTryOnRawPromptImageReferences(
      "图1是服装图，图2是参考图，图3是模特脸图。把图1衣服穿到图2模特身上，使用图3的脸。",
      params
    )).toContain("把图2衣服穿到图1模特身上，使用图3的脸");

    expect(normalizeTryOnRawPromptImageReferences(
      "图1是参考图，图2是服装图，图3是模特脸图。把图2衣服穿到图1模特身上，使用图3的脸。",
      params
    )).toContain("把图2衣服穿到图1模特身上，使用图3的脸");
  });

  it("uses source-safe try-on quality without 8K or RAW sharpening terms", () => {
    const prompt = enforceTryOnPromptRequirements(
      "图像角色：图1是参考图，图2是服装图。任务：给图1人物换上图2服装。",
      ["图1", "图2"],
      { hasReference: true, referenceImageNumber: 1 }
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
      "图像角色：图1是参考图，图2是服装图，图3是模特脸图。任务：给图1人物换上图2服装并使用图3模特脸。",
      ["图1", "图2", "图3"],
      {
        hasReference: true,
        hasModelFace: true,
        referenceImageNumber: 1,
        modelFaceImageNumber: 3,
      }
    );

    expect(prompt).toContain("模特脸规则（身份迁移）");
    expect(prompt).toContain("图3模特脸图是最终脸部身份锚点");
    expect(prompt).toContain("保留图1参考图原脸身份");
    expect(prompt).toContain("不同图层光影");
  });

  it("uses reference facial expression as a natural performance source when both reference and model face are present", () => {
    const { prompt } = buildTryOnPrompt({
      model: "gpt-image-2",
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

    expect(prompt).toContain("Follow the image roles below exactly");
    expect(prompt).toContain("Expression transfer:");
    expect(prompt).toContain("Use image 1 as the base try-on photo; replace only the sourced outfit areas with image 2 as clothing source; rebuild the final visible face from image 3");
    expect(prompt).toContain("image 3 is the only final face identity source");
    expect(prompt).toContain("not image 1's original person, not a random new face");
    expect(prompt).toContain("image 1 may guide only expression category/intensity");
    expect(prompt).toContain("It must not donate final face outline, eyes, nose, mouth");
    expect(prompt).toContain("visible expression category, intensity, emotional direction");
    expect(prompt).toContain("one coherent performance");
    expect(prompt).toContain("without copying image 3's original expression");
    expect(prompt).toContain("without flattening image 1's expression into a neutral catalog face");
    expect(prompt).toContain("Face blending:");
    expect(prompt).toContain("original head space, head bounding box, head-to-body ratio");
    expect(prompt).toContain("Fit image 3's identity geometry into image 1's head scale");
    expect(prompt).toContain("do not enlarge the head/face");
    expect(prompt).toContain("visible neck, chest, arms, and hands");
    expect(prompt).toContain("Do not change image 3's face outline, feature structure, feature proportions");
    expect(prompt).toContain("hair color, skin tone, makeup, or beauty styling alone is not identity transfer");
    expect(prompt).toContain("do not settle for an averaged face");
    expect(prompt).toContain("hairline, ear placement, and recognizable likeness stronger than image 1");
    expect(prompt).not.toContain("Similar-face identity risk:");
    expect(prompt).not.toContain("Same-hair/same-skin failure check:");
    expect(prompt).not.toContain("Corrective action:");
    expect(prompt).not.toContain("Head scale and fusion guard:");
    expect(prompt).toContain("1. image 3 controls final facial identity");
    expect(prompt).toContain("3. image 1 controls body proportions, head-to-body ratio, pose, expression performance");
    expect(prompt).not.toContain("facial expression exactly");
    expect(prompt).not.toContain("exact expression geometry");
    expect(prompt).not.toContain("visible expression/skin/makeup when present");
  });

  it("keeps the legacy GPT try-on template available behind the rollback env", () => {
    const previousTemplate = process.env.GPT_TRYON_PROMPT_TEMPLATE;
    process.env.GPT_TRYON_PROMPT_TEMPLATE = "legacy";

    try {
      const { prompt } = buildTryOnPrompt({
        model: "gpt-image-2",
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

      expect(prompt).toContain("Use image 1 as the body/composition/lighting base try-on photo, but replace its facial identity with image 3");
      expect(prompt).toContain("Face identity lock - HARD:");
      expect(prompt).toContain("image 3 is the final person identity");
      expect(prompt).not.toContain("Follow the image roles below exactly");
      expect(prompt).not.toContain("Fit image 3's identity geometry into image 1's head scale");
    } finally {
      if (previousTemplate === undefined) {
        delete process.env.GPT_TRYON_PROMPT_TEMPLATE;
      } else {
        process.env.GPT_TRYON_PROMPT_TEMPLATE = previousTemplate;
      }
    }
  });

  it("builds standalone nano banana try-on templates with visual analysis, multiple garments, and detail references", () => {
    for (const model of ["nano-banana-2", "nano-banana-pro"] as const) {
      const { prompt: basePrompt } = buildTryOnPrompt({
        model,
        clothingCount: 2,
        clothingMode: "multi",
        clothingRoles: ["upper", "lower"],
        garmentDetailCount: 2,
        hasReference: true,
        hasModelFace: true,
        clothingAnalysis: {
          mainCategory: "single_piece_top",
          subcategories: ["single_fitted_top"],
          clothTypeRaw: "striped cropped knit top",
          desc: "dark slim knit top with horizontal chest stripes",
          genderType: "women",
          ageRange: "adult",
          slot: "upper",
          fit: "fitted",
          confidence: 0.91,
        },
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
          detailFocus: ["face", "full body", "pose"],
          promptNotes: "Preserve the tall full-body crop, relaxed arm pose, and studio lighting.",
          confidence: 0.93,
        },
        aspectRatio: "3:4",
        style: "视觉分析：参考图头身比更修长，保持参考图身体比例，上衣条纹不要串到裤子",
      });
      const finalPrompt = applyTryOnRequestPrompt(basePrompt, {
        model,
        referenceUrl: "https://example.com/reference.jpg",
        modelFaceUrl: "https://example.com/face.jpg",
        garmentDetailPromptGroups: [
          {
            clothingIndex: 0,
            urls: ["upper-detail.jpg"],
            clothingImageNumber: 2,
            clothingLabel: "上装",
            detailImageNumbers: [5],
          },
          {
            clothingIndex: 1,
            urls: ["lower-detail.jpg"],
            clothingImageNumber: 3,
            clothingLabel: "下装",
            detailImageNumbers: [6],
          },
        ],
      });

      expect(basePrompt).toContain("Follow the image roles below exactly");
      expect(basePrompt).not.toContain("Nano Banana");
      expect(basePrompt).toContain("image 2 = upper clothing source only");
      expect(basePrompt).toContain("image 3 = lower clothing source only");
      expect(basePrompt).toContain("image 1 = target/base canvas only");
      expect(basePrompt).toContain("image 4 = final face identity only");
      expect(basePrompt).toContain("Reference visual analysis: image 1 body crop=full_body");
      expect(basePrompt).toContain("Visual garment read:");
      expect(basePrompt).toContain("Use image 2 as the upper-body source; image 3 as the lower-body source");
      expect(basePrompt).not.toContain("Confidence:");
      expect(basePrompt).not.toMatch(/confidence\s*[:=]\s*\d/i);
      expect(basePrompt).not.toMatch(/raw type=|slot=|upload mode=|explicit slots=/i);
      expect(basePrompt).toContain("User constraints structured from the original request:");
      expect(basePrompt).toContain("参考图头身比更修长");
      expect(basePrompt).toContain("上衣条纹不要串到裤子");
      expect(basePrompt).toContain("images 5-6 = garment detail references only");
      expect(basePrompt).toContain("images 5-6 are local detail supplements");
      expect(basePrompt).not.toContain("image 5+");
      expect(basePrompt).not.toContain("final prompt contains");
      expect(basePrompt).toContain("not a random new face, not a generic influencer/catalog face");
      expect(basePrompt).toContain("head-to-body ratio");
      expect(basePrompt).toContain("Expression transfer:");
      expect(basePrompt).toContain("eyelid/cheek/mouth-corner dynamics");
      expect(basePrompt).toContain("without copying image 4's original expression");
      expect(basePrompt).toContain("without flattening image 1's expression into a neutral catalog face");
      expect(basePrompt).toContain("Real human skin texture: preserve visible pores, fine skin texture");
      expect(basePrompt).toContain("no porcelain retouch, plastic/waxy skin, over-smoothing");
      expect(basePrompt).toContain("Face blending:");
      expect(basePrompt).toContain("original head space, head bounding box, head-to-body ratio");
      expect(basePrompt).toContain("Fit image 4's identity geometry into image 1's head scale");
      expect(basePrompt).toContain("do not enlarge the head/face");
      expect(basePrompt).toContain("visible neck, chest, arms, and hands");
      expect(basePrompt).not.toContain("香蕉服装上身脸部校准");
      expect(basePrompt).not.toContain("Similar-face identity risk:");
      expect(basePrompt).not.toContain("Same-hair/same-skin failure check:");
      expect(basePrompt).not.toContain("Head scale and fusion guard:");

      expect(finalPrompt).toContain("服装细节归属规则：");
      expect(finalPrompt).toContain("image 5 只补充 image 2（上装） 的局部细节");
      expect(finalPrompt).toContain("image 6 只补充 image 3（下装） 的局部细节");
      expect(finalPrompt).toContain("不得用于其他主服装图");
      expect(finalPrompt).toContain("不跨件迁移");
    }
  });

  it("does not mention garment detail image slots when no detail images are uploaded", () => {
    const { prompt } = buildTryOnPrompt({
      model: "nano-banana-2",
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
        detailFocus: ["full body"],
        promptNotes: "Keep the outdoor full-body crop.",
        confidence: 0.93,
      },
      style: "摄影风格：跟随参考图的影调，外面的开衫也要",
    });

    expect(prompt).not.toContain("image 4+");
    expect(prompt).not.toContain("Image 4 and later images");
    expect(prompt).not.toContain("Garment detail references:");
    expect(prompt).toContain("图1参考图的影调");
    expect(prompt).toContain("Real human skin texture: preserve visible pores, fine skin texture");
  });

  it("keeps banana single-garment role neutral instead of forcing every source into full-body clothing", () => {
    const { prompt } = buildTryOnPrompt({
      model: "nano-banana-2",
      clothingCount: 1,
      clothingMode: "single",
      clothingRoles: ["single"],
      hasReference: true,
      hasModelFace: false,
      clothingAnalysis: {
        mainCategory: "single_piece_top",
        subcategories: ["single_fitted_top"],
        clothTypeRaw: "cropped knit top",
        desc: "cropped fitted top",
        genderType: "women",
        ageRange: "adult",
        slot: "upper",
        fit: "fitted",
        confidence: 0.9,
      },
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
        detailFocus: ["full body"],
        promptNotes: "Keep the full-body crop.",
        confidence: 0.9,
      },
      aspectRatio: "3:4",
    });

    expect(prompt).toContain("image 2 = clothing source only: the uploaded garment/outfit itself, its natural body coverage");
    expect(prompt).toContain("Single-source garment rule: image 2 defines the uploaded garment or outfit and its natural coverage");
    expect(prompt).toContain("If it is a top, replace upper-body clothing only");
    expect(prompt).toContain("Use it as an upper/outer garment");
    expect(prompt).not.toContain("complete clothing source only");
    expect(prompt).not.toContain("one-piece/full-outfit slot");
    expect(prompt).not.toMatch(/raw type=|slot=|upload mode=|explicit slots=/i);
  });

  it("uses a short multi-output rule instead of candidate variation text", () => {
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

    expect(prompt).toContain("套用全局色调前");
    expect(prompt).toContain("多图输出规则：保持同一身份、脸部、表情、视线、头部姿态");
    expect(prompt).toContain("仅允许服装褶皱、下摆、接触阴影和布料自然贴合有轻微差异");
    expect(prompt).not.toContain("候选 2/2");
    expect(prompt).not.toContain("候选之间不要改变脸部");
    expect(prompt).not.toContain("候选差异只能来自服装版型");
    expect(prompt).not.toContain("avoid identical facial expressions");
    expect(prompt).not.toContain("micro-expression");
  });

  it("does not duplicate runtime crop lock when the base prompt already has reference analysis", () => {
    const referenceAnalysis = {
      index: 1,
      bodyCrop: "upper_body" as const,
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
    };
    const runtimeOptions = {
      model: "gpt-image-2" as const,
      candidateIndex: 0,
      candidateCount: 1,
      referenceUrl: "https://example.com/reference.jpg",
      modelFaceUrl: "https://example.com/face.jpg",
      referenceAnalysis,
      referenceImageNumber: 2,
    };

    const rawPrompt = applyTryOnRequestPrompt("BASE", runtimeOptions);
    const lockedPrompt = applyTryOnRequestPrompt(
      "BASE\nReference visual analysis: image 2 body crop=upper_body. Crop lock - HARD: keep image 2 as an upper-body target frame.",
      runtimeOptions
    );

    expect(rawPrompt).toContain("裁切锁定：Crop lock - HARD");
    expect(lockedPrompt).not.toContain("裁切锁定：");
    expect(lockedPrompt.match(/Crop lock - HARD/g) || []).toHaveLength(1);
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
    expect(prompt.match(/模特的脸换成图3的脸/g) || []).toHaveLength(1);
    expect(prompt).toContain("裙子颜色和图2完全一致");
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

    expect(prompt).toContain("image 2 = lower clothing source only");
    expect(prompt).toContain("Use image 2 as the lower-body source");
    expect(prompt).toContain("User-selected lower upload area wins over the visual read that looked upper");
    expect(prompt).toContain("Use it as a lower-body garment");
    expect(prompt).toContain("replace only lower-body clothing");
    expect(prompt).toContain("image 1 is a no-head/no-face target frame");
    expect(prompt).toContain("Do not generate, reveal, add, infer, or hallucinate any head, face, hair");
    expect(prompt).toContain("Preserve the crop and do not invent a new face, head, hair");
    expect(prompt).not.toContain("Replace only upper/outer clothing");
    expect(prompt).not.toMatch(/raw type=|slot=|upload mode=|explicit slots=/i);
    expect(prompt).not.toContain("Preserve image 1's original facial identity");
  });

  it("uses high-confidence visual audience hints without leaking confidence text", () => {
    const { prompt } = buildTryOnPrompt({
      clothingCount: 1,
      clothingMode: "single",
      clothingRoles: ["single"],
      hasReference: true,
      hasModelFace: false,
      garmentAudience: "women",
      ageGroup: "adult",
      clothingAnalysis: {
        mainCategory: "single_piece_top",
        subcategories: ["single_fitted_top"],
        clothTypeRaw: "boys toddler t-shirt",
        desc: "A small boys toddler top with playful child sizing.",
        genderType: "men",
        ageRange: "toddler",
        slot: "upper",
        fit: "regular",
        confidence: 0.92,
      },
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
        detailFocus: ["full body"],
        promptNotes: "Use the visible full-body pose.",
        confidence: 0.9,
      },
      aspectRatio: "3:4",
    });

    expect(prompt).toContain("Visual audience hint:");
    expect(prompt).toContain("male toddler");
    expect(prompt).toContain("garment-fit/body-context evidence");
    expect(prompt).not.toContain("Confidence:");
    expect(prompt).not.toMatch(/confidence\s*[:=]\s*\d/i);
    expect(prompt).not.toMatch(/92%|0\.92/);
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
    expect(prompt).toContain("image 1 is a lower-body-only target frame with no visible head or face");
    expect(prompt).toContain("ignore image 3 completely for this no-head crop");
    expect(prompt).toContain("A result with any visible face or newly added head is invalid");
    expect(prompt).toContain("image 3 = inactive because the target crop has no usable face/head swap area");
    expect(prompt).toContain("Preserve the crop and ignore image 3");
    expect(prompt).toContain("do not invent a new face, head, hair, portrait, or full-body expansion");
    expect(prompt).not.toContain("Reconstruct the final face");
    expect(prompt).not.toContain("Every generated candidate must use image 3's identity");
    expect(prompt).not.toContain("mandatory final face identity reference only");
    expect(prompt).not.toContain("image 3 is the final face identity source");
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
    expect(prompt).toContain("image 1 is a lower-body-only target frame with no visible head or face");
    expect(prompt).toContain("do not invent a default face or complete person");
    expect(prompt).toContain("A result with any visible face or newly added head is invalid");
    expect(prompt).toContain("Do not reveal upper-body areas, head, or face outside the original crop");
    expect(prompt).not.toContain("Face identity integration:");
    expect(prompt).not.toContain("mandatory face identity reference");
  });
});
