import { describe, expect, it } from "vitest";
import {
  buildOutfitFusionDemoResults,
  buildOutfitFusionPrompt,
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
    expect(prompt).toContain("【后台隐藏脸部约束，仅用于生成执行，不要写进用户输入框】");
    expect(prompt).toContain("图6是最终脸部身份唯一来源");
    expect(prompt).toContain("最终脸必须一眼像图6本人");
    expect(prompt).toContain("图1只提供身体、姿态、头部位置");
    expect(prompt).not.toContain("生成 4 张候选图");
    expect(prompt).not.toContain("GPT-Image-2");
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
    expect(prompt).not.toMatch(/图\d+\s*=/);
    expect(prompt).not.toContain("最终脸=");
    expect(prompt).not.toContain("身体/姿态/构图/光影");
    expect(prompt).toContain("图3是最终脸部身份唯一来源");
  });

  it("does not inject generation count or model metadata into the prompt", () => {
    const template = OUTFIT_FUSION_TEMPLATES[0];
    const prompt = buildOutfitFusionPrompt({
      templatePrompt: template.prompt,
      assets: template.assets,
      config: { ...DEFAULT_OUTFIT_FUSION_CONFIG, aiModel: "gpt-image-2", genCount: 4 },
    });

    expect(prompt).toContain(template.prompt);
    expect(prompt).not.toContain("最终只生成一张完整的单人商业摄影穿搭照片");
    expect(prompt).not.toContain("多个候选结果");
    expect(prompt).not.toContain("拼图、四宫格");
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
