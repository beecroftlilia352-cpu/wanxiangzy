import { describe, expect, it } from "vitest";
import {
  buildOutfitFusionDemoResults,
  buildOutfitFusionPrompt,
  buildOutfitFusionRuntimePlan,
  buildOutfitFusionVisibleFaceText,
  buildOutfitFusionVisionPromptRequest,
  clampOutfitFusionCount,
  DEFAULT_OUTFIT_FUSION_CONFIG,
  normalizeOutfitFusionAssistantPrompt,
  outfitFusionReferencesFromAssets,
  OUTFIT_FUSION_TEMPLATES,
  resolveOutfitFusionSmartAspectImage,
} from "@/lib/outfit-fusion";
import { createGenericImagePreviewSession, getPreviewCanvasInputReferences } from "@/lib/studio-image-preview";

describe("outfit fusion templates", () => {
  it("keeps reusable example templates with assets and demo results", () => {
    expect(OUTFIT_FUSION_TEMPLATES.length).toBeGreaterThanOrEqual(10);

    for (const template of OUTFIT_FUSION_TEMPLATES) {
      expect(template.id).toBeTruthy();
      expect(template.prompt).toContain("图");
      expect(template.assets.length).toBeGreaterThanOrEqual(3);
      expect(template.coverUrl).toMatch(/^https:\/\//);
      expect(new URL(template.coverUrl).host).not.toBe("img.alicdn.com");
      for (const asset of template.assets) {
        expect(asset.url).toMatch(/^https:\/\//);
        expect(new URL(asset.url).host).not.toBe("img.alicdn.com");
      }
    }
  });

  it("keeps templates user-visible and adds hidden face constraints only to request prompts", () => {
    const template = OUTFIT_FUSION_TEMPLATES[0];
    const prompt = buildOutfitFusionPrompt({
      templatePrompt: template.prompt,
      assets: template.assets,
      customPrompt: "保持电商商拍质感",
      config: DEFAULT_OUTFIT_FUSION_CONFIG,
    });

    expect(template.prompt).toContain("把模特换成图6的模特，保留图6模特的面部五官、脸部轮廓、骨相、皮肤颜色、发色及发型");
    expect(template.prompt).not.toContain("后台隐藏脸部约束");
    expect(template.prompt).not.toContain("最终脸必须一眼像");

    expect(prompt).toContain(template.prompt);
    expect(prompt).toMatch(/^图像角色锁定：图1=target\/base canvas/);
    expect(prompt).toContain("脸部身份规则：图6是最终脸部身份唯一来源");
    expect(prompt).toContain("最终脸必须一眼像图6本人");
    expect(prompt).toContain("图1只提供身体、姿态、构图");
    expect(prompt).toContain("身体比例/头身比");
    expect(prompt).toContain("不要头身比漂移、不要大头小身");
    expect(prompt).toContain("表情迁移细节：保留图1的可见表情类别、强度、情绪方向、视线、面部张力、眼睑/脸颊/嘴角动态和自然不对称");
    expect(prompt).toContain("不要复制图6原图表情");
    expect(prompt).toContain("不要把图1的自然表情抹平成中性网红脸或僵硬模板脸");
    expect(prompt).toContain("脸部融合细节：在图1原有头部空间和镜头透视中重建脸部");
    expect(prompt).toContain("下颌到脖子过渡");
    expect(prompt).toContain("最终脸必须与图1可见的颈、胸、手臂、手自然衔接");
    expect(prompt).toContain("核心编辑任务：以图1作为最终画面的唯一底图/构图基础");
    expect(prompt).toContain("核心任务：");
    expect(prompt).toContain("固定生成规则：最终只生成一张完整的单人商业摄影穿搭照片");
    expect(prompt).toContain("不要拼图、四宫格、2x2 网格、分屏");
    expect(prompt).toContain("商品视觉读取：先根据每张商品图真实画面判断品类、自然覆盖区域、穿戴方式");
    expect(prompt).toContain("多商品视觉分配：逐张判断图2、图3、图4、图5各自是上衣、下装、外套、连衣裙");
    expect(prompt).toContain("局部细节/多角度补充：如果某张商品图只是面料、领口、袖口、口袋");
    expect(prompt).toContain("无法判断对应关系时直接忽略");
    expect(prompt).not.toContain("生成 4 张候选图");
    expect(prompt).not.toContain("GPT-Image-2");
  });

  it("keeps single outfit sources scoped to their natural coverage", () => {
    const prompt = buildOutfitFusionPrompt({
      templatePrompt: "让自然商业模特穿图1商品，把模特换成图2的模特。",
      assets: [
        { id: "outfit", role: "outfit", url: "https://example.com/top.png" },
        { id: "model", role: "model", url: "https://example.com/model.png" },
      ],
      config: DEFAULT_OUTFIT_FUSION_CONFIG,
    });

    expect(prompt).toContain("单商品穿戴范围：先判断图1是上衣、下装、外套、连衣裙");
    expect(prompt).toContain("若是上衣，只替换上半身冲突服装；若是下装，只替换下半身冲突服装");
    expect(prompt).toContain("若是连衣裙、连体衣、套装、大衣或完整穿搭，才替换它自然覆盖的冲突区域");
    expect(prompt).toContain("若只是鞋、包、帽、围巾、腰带或首饰，只放在对应佩戴/持拿位置");
  });

  it("keeps every model-face example template on the visible face sentence", () => {
    for (const template of OUTFIT_FUSION_TEMPLATES) {
      const modelIndex = template.assets.findIndex((asset) => asset.role === "model");
      if (modelIndex < 0) continue;

      const modelLabel = `图${modelIndex + 1}`;
      expect(template.prompt).toContain(buildOutfitFusionVisibleFaceText(modelLabel));
      expect(template.prompt).not.toContain("脸部身份规则");
      expect(template.prompt).not.toContain("最终脸部身份唯一来源");
    }
  });

  it("keeps canonical image numbers as the only prompt references", () => {
    const userPrompt = "让参考图中的人物姿态和场景氛围作为画面基础，身穿图2的灰褐色吊带长裙，外搭图3的米白色刺绣立领马甲，头戴图4的燕麦色渔夫帽，颈间系着图5的薄荷绿印花围巾，脚穿图1的银色夹趾凉鞋，手持图6的孔雀绿菱格纹链条包，把模特换成图8的模特。";
    const prompt = buildOutfitFusionPrompt({
      templatePrompt: userPrompt,
      assets: [
        { id: "outfit-1", role: "outfit", url: "https://example.com/shoes.png" },
        { id: "reference", role: "reference", url: "https://example.com/reference.png" },
        { id: "model", role: "model", url: "https://example.com/model.png" },
      ],
      config: DEFAULT_OUTFIT_FUSION_CONFIG,
    });

    expect(prompt).toContain(userPrompt);
    expect(prompt).not.toMatch(/【(?:参考图|搭配图|模特图)\d+】/);
    expect(prompt).toContain("图像角色锁定：");
    expect(prompt).not.toContain("最终脸=");
    expect(prompt).toContain("图3是最终脸部身份唯一来源");
    expect(prompt).toContain("一律以当前真实上传的图3作为最终脸部身份来源");
    expect(prompt).toContain("图1只作为服装、鞋包、帽子、围巾或配饰商品来源");
  });

  it("builds a reference-first runtime plan and remaps prompt image numbers", () => {
    const plan = buildOutfitFusionRuntimePlan({
      assets: [
        { id: "shirt", role: "outfit", url: "https://example.com/shirt.png" },
        { id: "face", role: "model", url: "https://example.com/face.png" },
        { id: "reference", role: "reference", url: "https://example.com/reference.png" },
        { id: "bag", role: "outfit", url: "https://example.com/bag.png" },
      ],
      userPrompt: "让图3的人物姿态、构图和场景氛围作为画面基础，身穿图1的衬衫，手持图4的包，把模特换成图2的模特。",
      config: DEFAULT_OUTFIT_FUSION_CONFIG,
    });

    expect(plan.assets.map((asset) => asset.id)).toEqual(["reference", "shirt", "bag", "face"]);
    expect(plan.referenceUrls).toEqual([
      "https://example.com/reference.png",
      "https://example.com/shirt.png",
      "https://example.com/bag.png",
      "https://example.com/face.png",
    ]);
    expect(plan.referenceUrl).toBe("https://example.com/reference.png");
    expect(plan.clothingUrls).toEqual(["https://example.com/shirt.png", "https://example.com/bag.png"]);
    expect(plan.modelFaceUrl).toBe("https://example.com/face.png");
    expect(plan.imageNumberMap).toEqual([
      { originalImageNumber: 3, runtimeImageNumber: 1, role: "reference", url: "https://example.com/reference.png" },
      { originalImageNumber: 1, runtimeImageNumber: 2, role: "outfit", url: "https://example.com/shirt.png" },
      { originalImageNumber: 4, runtimeImageNumber: 3, role: "outfit", url: "https://example.com/bag.png" },
      { originalImageNumber: 2, runtimeImageNumber: 4, role: "model", url: "https://example.com/face.png" },
    ]);
    expect(plan.prompt).toContain("图像角色锁定：图1=target/base canvas");
    expect(plan.prompt).toContain("图4=model face identity 模特脸图");
    expect(plan.prompt).toContain("核心任务：让图1的人物姿态、构图和场景氛围作为画面基础，身穿图2的衬衫，手持图3的包，把模特换成图4的模特。");
    expect(plan.prompt).not.toContain("身穿图1的衬衫");
    expect(plan.prompt).not.toContain("换成图2的模特");
  });

  it("keeps no-reference runtime plans outfit-first without inventing a base canvas", () => {
    const plan = buildOutfitFusionRuntimePlan({
      assets: [
        { id: "face", role: "model", url: "https://example.com/face.png" },
        { id: "dress", role: "outfit", url: "https://example.com/dress.png" },
      ],
      userPrompt: "让自然商业模特穿图2的连衣裙，把模特换成图1的模特。",
      config: DEFAULT_OUTFIT_FUSION_CONFIG,
    });

    expect(plan.assets.map((asset) => asset.id)).toEqual(["dress", "face"]);
    expect(plan.referenceUrl).toBeNull();
    expect(plan.modelFaceUrl).toBe("https://example.com/face.png");
    expect(plan.prompt).toContain("本次没有上传 target/base canvas 目标底图");
    expect(plan.prompt).toContain("核心生成任务：生成一张新的单人商业穿搭照片");
    expect(plan.prompt).toContain("核心任务：让自然商业模特穿图1的连衣裙，把模特换成图2的模特。");
    expect(plan.prompt).not.toContain("图1=target/base canvas");
  });

  it("does not inject generation count or model metadata into the prompt", () => {
    const template = OUTFIT_FUSION_TEMPLATES[0];
    const prompt = buildOutfitFusionPrompt({
      templatePrompt: template.prompt,
      assets: template.assets,
      config: { ...DEFAULT_OUTFIT_FUSION_CONFIG, aiModel: "gpt-image-2", genCount: 4 },
    });

    expect(prompt).toContain(template.prompt);
    expect(prompt).toContain("最终只生成一张完整的单人商业摄影穿搭照片");
    expect(prompt).toContain("不要把参考图、商品图、步骤图或多个候选结果拼到同一张画面里");
    expect(prompt).toContain("不要拼图、四宫格");
    expect(prompt).not.toContain("生成 4 张候选图");
    expect(prompt).not.toContain("GPT-Image-2");
  });

  it("clamps generation count and repeats demo results to the requested count", () => {
    expect(clampOutfitFusionCount(0)).toBe(1);
    expect(clampOutfitFusionCount(8)).toBe(4);

    const urls = buildOutfitFusionDemoResults(OUTFIT_FUSION_TEMPLATES[0], 4);
    expect(urls).toHaveLength(4);
    expect(urls.every((url) => url.startsWith("https://"))).toBe(true);
  });

  it("keeps every outfit fusion input visible in preview canvas references", () => {
    const template = OUTFIT_FUSION_TEMPLATES[0];
    const references = outfitFusionReferencesFromAssets(template.assets);
    const session = createGenericImagePreviewSession({
      module: "outfitFusion",
      urls: template.resultUrls,
      references,
      expectedCount: 4,
    });

    expect(getPreviewCanvasInputReferences(session)).toHaveLength(references.length);
    expect(references.map((reference) => reference.label)).toEqual(template.assets.map((_, index) => `图${index + 1}`));
  });

  it("uses the target reference image for smart aspect ratio", () => {
    expect(resolveOutfitFusionSmartAspectImage({
      assets: [
        { role: "outfit", url: "https://example.com/outfit-square.png" },
        { role: "reference", url: "https://example.com/reference-portrait.png" },
        { role: "model", url: "https://example.com/model.png" },
      ],
      referenceUrls: [
        "https://example.com/outfit-square.png",
        "https://example.com/reference-portrait.png",
        "https://example.com/model.png",
      ],
      resolvedReferenceUrls: [
        "resolved-outfit-square",
        "resolved-reference-portrait",
        "resolved-model",
      ],
    })).toBe("resolved-reference-portrait");
  });

  it("does not use outfit product images for smart aspect ratio when no reference is provided", () => {
    expect(resolveOutfitFusionSmartAspectImage({
      assets: [
        { role: "outfit", url: "https://example.com/outfit-square.png" },
        { role: "model", url: "https://example.com/model.png" },
      ],
      referenceUrls: [
        "https://example.com/outfit-square.png",
        "https://example.com/model.png",
      ],
      resolvedReferenceUrls: [
        "resolved-outfit-square",
        "resolved-model",
      ],
    })).toBeUndefined();

    const noReferencePrompt = buildOutfitFusionPrompt({
      templatePrompt: "让模特穿着图1商品。",
      assets: [
        { id: "outfit", role: "outfit", url: "https://example.com/outfit-square.png" },
      ],
      config: DEFAULT_OUTFIT_FUSION_CONFIG,
    });
    expect(noReferencePrompt).toBe("让模特穿着图1商品。");
  });

  it("normalizes AI write output to a single user-visible sentence", () => {
    const echoedInternalPrompt = [
      "图像角色：图1是参考图；图2是参考图。",
      "任务：这是搭配融图的 AI 帮写任务，请调用视觉理解能力分析所有输入图。",
      "输出格式：让图X的模特穿着图Y的商品，把模特换成图M的模特。",
      "图片输入关系如下，仅供你判断编号和商品，不要原样输出：",
      "用户已有要求: 让图7的模特穿着图1的一双银色的高跟凉鞋，穿着图2的一件浅灰色的吊带连衣裙，戴着图4的米色编织帽子，拿着图6的绿色手提包，把模特换成图8的模特。",
      "最终只返回这一句话本身，不要追加后台固定规则。画面真实自然，photorealistic, sharp details。",
    ].join(" ");

    const normalized = normalizeOutfitFusionAssistantPrompt(echoedInternalPrompt, "");
    expect(normalized).toContain("让图7的模特穿着图1的一双银色的高跟凉鞋");
    expect(normalized).toContain("把模特换成图8的模特，保留图8模特的面部五官、脸部轮廓、骨相、皮肤颜色、发色及发型");
    expect(normalized).not.toContain("最终人物脸部身份以图8为准");
    expect(normalized).not.toContain("不要追加后台固定规则");
  });

  it("removes vision confidence and field-style analysis from AI writing output", () => {
    const normalized = normalizeOutfitFusionAssistantPrompt(
      "视觉分析：图1 upper，slot=upper，confidence=95%。用户已有要求: 让图2的人物姿态作为画面基础，身穿图1的白色衬衫，把模特换成图3的模特。",
      ""
    );

    expect(normalized).toContain("让图2的人物姿态作为画面基础");
    expect(normalized).toContain("身穿图1的白色衬衫");
    expect(normalized).toContain("把模特换成图3的模特，保留图3模特的面部五官");
    expect(normalized).not.toMatch(/confidence|置信度|95%|slot=/i);
  });

  it("asks AI writing to return the same visible relationship sentence only", () => {
    const request = buildOutfitFusionVisionPromptRequest([
      { id: "outfit-1", role: "outfit", url: "https://example.com/dress.png" },
      { id: "reference", role: "reference", url: "https://example.com/reference.png" },
      { id: "model", role: "model", url: "https://example.com/model.png" },
    ], "让图2的人物姿态、构图和场景氛围作为画面基础，身穿图1商品，把模特换成图3的模特。");

    expect(request).toContain("输出必须是用户输入框可见的一句话");
    expect(request).toContain(buildOutfitFusionVisibleFaceText("图M"));
    expect(request).toContain("不要把后台脸部完整约束、优先级、负面规则写进输入框");
    expect(request).toContain("单件商品不要默认当成完整全身套装");
    expect(request).toContain("多件商品要按视觉识别分配到正确身体区域和层级");
    expect(request).toContain("如果输入里有局部细节图、背面图、侧面图或面料图");
    expect(request).toContain("不要写后台规则、脸部身份规则、图片关系、商品保真、优先级、负面约束、生成张数、模型名、比例、清晰度、视觉分析过程、识别置信度、概率、字段名");
    expect(request).toContain("图1只提供商品本体，先视觉识别它是主服装、鞋包配饰、连体/套装，还是局部细节、背面、侧面或面料补充");
    expect(request).toContain("图2只提供人物身体、姿态、头部位置、构图、场景氛围、光影和背景");
    expect(request).toContain("图3只提供最终模特脸部身份");
    expect(request).not.toMatch(/【(?:参考图|搭配图|模特图)\d+】/);
  });

  it("normalizes AI write output to the natural outfit relationship template", () => {
    const prompt = "让图7的人物姿态、构图和场景氛围作为画面基础，穿上图1的银色高跟凉鞋，身穿图2的浅灰色吊带连衣裙，戴着图4的米色编织帽子，手持图6的绿色手提包，把模特换成图8的模特，保留图8模特的面部五官、脸部轮廓、骨相、皮肤颜色、发色及发型，生成真实自然的商业穿搭图。";
    const echoedInternalPrompt = [
      "输出使用自然关系句：让图X的人物穿上图Y商品，把模特换成图M的模特。",
      "用户已有要求:",
      prompt,
      "最终只返回这一句话本身。",
    ].join(" ");

    expect(normalizeOutfitFusionAssistantPrompt(echoedInternalPrompt, "")).toBe(prompt);
  });
});
