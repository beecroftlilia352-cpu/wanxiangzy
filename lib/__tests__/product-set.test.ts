import { describe, expect, it } from "vitest";
import {
  PRODUCT_SET_PROMPT_VERSION,
  buildProductSetPrompt,
  getProductSetModuleKey,
  getProductSetModuleReason,
  inferProductSetProductProfile,
  resolveProductSetTemplates,
  shouldUseModelForTemplate,
} from "../product-set";

describe("product set smart planning", () => {
  it("uses apparel-aware modules with model scenes for womenswear details", () => {
    const profile = inferProductSetProductProfile("商品名称: 淡紫色撞色连帽抓绒外套\n商品描述: 女装外套，连帽、袖口罗纹、柔软抓绒面料。");
    const templates = resolveProductSetTemplates({
      mode: "smart",
      imageType: "details",
      genCount: 6,
      productProfile: profile,
    });

    expect(profile.isApparel).toBe(true);
    expect(profile.needsModel).toBe(true);
    expect(templates.map((item) => item.id)).toEqual([117, 105, 106, 107, 113, 7]);
    expect(templates.some((template) => shouldUseModelForTemplate(template, profile))).toBe(true);
  });

  it("routes womenswear hero modules by selected style pack instead of always using French commute", () => {
    const profile = inferProductSetProductProfile("商品名称: 女装连帽外套\n商品描述: 柔软面料，日常穿搭，适合详情页套图。");
    const baseSettings = {
      country: "中国",
      language: "中文",
      platform: "淘宝",
      themeMode: "auto" as const,
      themeColor: "智能主题色",
      fontStyle: "auto" as const,
      extraDescription: "",
    };

    const cases = [
      ["auto", 117],
      ["french_commute", 108],
      ["korean_sweet", 114],
      ["outdoor_utility", 115],
      ["xiaohongshu_girl", 118],
      ["shein_fastfashion", 116],
    ] as const;

    for (const [stylePackId, firstTemplateId] of cases) {
      const templates = resolveProductSetTemplates({
        mode: "smart",
        imageType: "details",
        genCount: 3,
        productProfile: profile,
        settings: { ...baseSettings, stylePackId },
      });

      expect(templates[0].id).toBe(firstTemplateId);
    }
  });

  it("keeps generic product details focused on non-model ecommerce modules", () => {
    const profile = inferProductSetProductProfile("商品名称: 桌面循环风扇\n商品描述: 小型家用电器，强调安全防护、静音、风力。");
    const templates = resolveProductSetTemplates({
      mode: "smart",
      imageType: "details",
      genCount: 6,
      productProfile: profile,
    });

    expect(profile.isApparel).toBe(false);
    expect(profile.needsModel).toBe(false);
    expect(templates.map((item) => item.id)).toEqual([14, 13, 24, 17, 11, 27]);
    expect(templates.some((template) => shouldUseModelForTemplate(template, profile))).toBe(false);
  });

  it("applies module overrides and keeps prompt version/style pack traceable", () => {
    const profile = inferProductSetProductProfile("商品名称: 女装连帽外套\n商品描述: 女装外套，柔软面料，通勤穿搭。");
    const base = resolveProductSetTemplates({
      mode: "smart",
      imageType: "details",
      genCount: 4,
      productProfile: profile,
    });
    const firstKey = getProductSetModuleKey(base[0], 0);
    const secondKey = getProductSetModuleKey(base[1], 1);
    const templates = resolveProductSetTemplates({
      mode: "smart",
      imageType: "details",
      genCount: 4,
      productProfile: profile,
      moduleOverrides: [
        { key: firstKey, disabled: true },
        { key: secondKey, name: "Edited model scene", copyDensity: "light" },
      ],
    });

    expect(templates.map((item) => item.id)).not.toContain(base[0].id);
    expect(templates[0].name).toBe("Edited model scene");
    expect(getProductSetModuleReason(templates[0], profile)).toContain("上身");

    const prompt = buildProductSetPrompt({
      productInfo: "商品名称: 女装连帽外套",
      productProfile: profile,
      productImageCount: 3,
      template: templates[0],
      allTemplates: templates,
      settings: {
        country: "中国",
        language: "中文",
        platform: "小红书",
        themeMode: "auto",
        themeColor: "智能主题色",
        fontStyle: "auto",
        stylePackId: "minimal_indie",
      },
      mode: "smart",
      aspectRatio: templates[0].aspectRatio,
      imageSize: "1K",
      sequenceIndex: 0,
      totalCount: templates.length,
    });

    expect(prompt).toContain(PRODUCT_SET_PROMPT_VERSION);
    expect(prompt).toContain("minimal independent");
    expect(prompt).toContain("Copy density for this module: light");
  });
});
