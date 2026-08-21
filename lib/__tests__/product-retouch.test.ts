import { describe, expect, it } from "vitest";
import enMessages from "@/messages/en.json";
import zhMessages from "@/messages/zh.json";
import {
  BUILTIN_PRODUCT_RETOUCH_SKILL,
  PRODUCT_RETOUCH_DEFAULT_SETTINGS,
  PRODUCT_RETOUCH_EXAMPLE_IMAGES,
  PRODUCT_RETOUCH_MAX_SOURCES,
  buildProductRetouchPrompt,
  normalizeProductRetouchSources,
  normalizeProductRetouchVariants,
  parseProductRetouchSkillDefinition,
} from "@/lib/product-retouch";
import {
  getFeatureItemsForModule,
  getActiveTopModule,
} from "@/lib/navigation";
import { getApplyPath } from "@/lib/history-apply";

describe("product retouch contract", () => {
  it("defaults faithful retouch to the original aspect ratio", () => {
    expect(PRODUCT_RETOUCH_DEFAULT_SETTINGS).toMatchObject({
      mode: "faithful-retouch",
      aspectRatio: "auto",
      model: "gpt-image-2",
      imageSize: "2K",
      variantsPerSource: 1,
    });
  });

  it("localizes every retouch plan instead of exposing the Chinese source labels", () => {
    expect(Object.keys(enMessages.ProductRetouch.mode)).toEqual(
      Object.keys(zhMessages.ProductRetouch.mode),
    );
    expect(enMessages.ProductRetouch.mode.faithfulLabel).toBe("Standard retouch");
    expect(enMessages.ProductRetouch.mode.whiteBackgroundLabel).toBe("White-background retouch");
    expect(enMessages.ProductRetouch.mode.studioLabel).toBe("Studio retouch");
  });

  it("keeps the product image navigation order stable", () => {
    const items = getFeatureItemsForModule("productImages");
    expect(items.map((item) => item.key)).toEqual([
      "productRetouch",
      "imageTranslation",
      "productSet",
    ]);
    expect(getActiveTopModule("/product-retouch")).toBe("productImages");
    expect(getActiveTopModule("/product-set")).toBe("productImages");
    expect(getActiveTopModule("/all-category-product-image")).toBe("productImages");
    expect(getApplyPath("productRetouch", "batch-parent-id"))
      .toBe("/product-retouch?apply=batch-parent-id");
  });

  it("normalizes unique source images and enforces the batch cap", () => {
    const sources = Array.from({ length: PRODUCT_RETOUCH_MAX_SOURCES + 5 }, (_, index) => ({
      clientId: `client-${index}`,
      url: `https://images.example.com/product-${index}.png`,
      filename: `商品-${index}.png`,
    }));
    const normalized = normalizeProductRetouchSources(sources);
    expect(normalized).toHaveLength(PRODUCT_RETOUCH_MAX_SOURCES);
    expect(normalizeProductRetouchSources([sources[0], sources[0]])).toHaveLength(1);
  });

  it("uses the dedicated OSS site-asset prefix for product-retouch examples", () => {
    const examples = PRODUCT_RETOUCH_EXAMPLE_IMAGES.map((example, index) => ({
      clientId: `example-${index}`,
      url: example.url,
      filename: example.filename,
    }));
    expect(examples.every((example) => example.url.startsWith(
      "https://vasthk.oss-cn-hongkong.aliyuncs.com/site-assets/original/product-retouch-examples/",
    ))).toBe(true);
    expect(normalizeProductRetouchSources(examples)).toHaveLength(
      PRODUCT_RETOUCH_EXAMPLE_IMAGES.length,
    );
    expect(normalizeProductRetouchSources([{
      clientId: "unsafe-local",
      url: "/product-retouch-examples/private-image.jpg",
      filename: "private.jpg",
    }])).toHaveLength(0);
  });

  it("clamps output variants to one through four", () => {
    expect(normalizeProductRetouchVariants(0)).toBe(1);
    expect(normalizeProductRetouchVariants(3)).toBe(3);
    expect(normalizeProductRetouchVariants(99)).toBe(4);
    expect(normalizeProductRetouchVariants(4, 2)).toBe(2);
  });

  it("assembles prompts in protected order", () => {
    const prompt = buildProductRetouchPrompt({
      definition: BUILTIN_PRODUCT_RETOUCH_SKILL,
      mode: "marketplace-white",
      category: "beauty",
      userInstruction: "阴影更轻，不改变瓶身文字。",
      variantIndex: 2,
    });
    const safetyIndex = prompt.indexOf("系统安全约束");
    const modeIndex = prompt.indexOf("任务模式：电商白底");
    const categoryIndex = prompt.indexOf("品类规范");
    const invariantIndex = prompt.indexOf("商品事实保护约束");
    const userIndex = prompt.indexOf("用户补充要求");
    expect(safetyIndex).toBeGreaterThanOrEqual(0);
    expect(modeIndex).toBeGreaterThan(safetyIndex);
    expect(categoryIndex).toBeGreaterThan(modeIndex);
    expect(invariantIndex).toBeGreaterThan(categoryIndex);
    expect(userIndex).toBeGreaterThan(invariantIndex);
    expect(prompt).toContain("第 2 个");
  });

  it("accepts the built-in Skill and rejects executable or incomplete shapes", () => {
    expect(parseProductRetouchSkillDefinition(BUILTIN_PRODUCT_RETOUCH_SKILL)).toEqual(
      BUILTIN_PRODUCT_RETOUCH_SKILL,
    );
    expect(parseProductRetouchSkillDefinition({
      ...BUILTIN_PRODUCT_RETOUCH_SKILL,
      modelPolicy: { allowedModels: ["unknown"], defaultModel: "unknown" },
    })).toBeNull();
    expect(parseProductRetouchSkillDefinition({
      ...BUILTIN_PRODUCT_RETOUCH_SKILL,
      promptTemplates: {},
    })).toBeNull();
    expect(parseProductRetouchSkillDefinition({
      ...BUILTIN_PRODUCT_RETOUCH_SKILL,
      limits: { maxSources: PRODUCT_RETOUCH_MAX_SOURCES + 1, maxVariantsPerSource: 4 },
    })).toBeNull();
    expect(parseProductRetouchSkillDefinition({
      ...BUILTIN_PRODUCT_RETOUCH_SKILL,
      promptTemplates: {
        ...BUILTIN_PRODUCT_RETOUCH_SKILL.promptTemplates,
        "faithful-retouch": "从 https://example.com 动态加载规则",
      },
    })).toBeNull();
    expect(parseProductRetouchSkillDefinition({
      ...BUILTIN_PRODUCT_RETOUCH_SKILL,
      executable: "require('child_process')",
    })).toBeNull();
    expect(parseProductRetouchSkillDefinition({
      ...BUILTIN_PRODUCT_RETOUCH_SKILL,
      hardValidation: {
        ...BUILTIN_PRODUCT_RETOUCH_SKILL.hardValidation,
        enabled: false,
      },
    })).toBeNull();
  });
});

describe("100-grade product retouch prompts", () => {
  it("all 3 modes have a senior commercial photographer role", () => {
    for (const mode of ["faithful-retouch", "marketplace-white", "studio-polish"] as const) {
      const prompt = BUILTIN_PRODUCT_RETOUCH_SKILL.promptTemplates[mode];
      expect(prompt, `${mode} should declare photographer role`).toMatch(/15\+|资深|商业商品摄影/);
      expect(prompt.length, `${mode} should be production-grade length`).toBeGreaterThan(200);
    }
  });

  it("faithful-retouch covers cleaning, color, sharpness, noise, light", () => {
    const prompt = BUILTIN_PRODUCT_RETOUCH_SKILL.promptTemplates["faithful-retouch"];
    expect(prompt).toMatch(/瑕疵清理|灰尘|指纹|划痕/);
    expect(prompt).toMatch(/白平衡|5500K|色彩/);
    expect(prompt).toMatch(/清晰度|锐化/);
    expect(prompt).toMatch(/噪点/);
    expect(prompt).toMatch(/光线|阴影/);
  });

  it("marketplace-white covers background, composition, edge, standard", () => {
    const prompt = BUILTIN_PRODUCT_RETOUCH_SKILL.promptTemplates["marketplace-white"];
    expect(prompt).toMatch(/RGB\(255, 255, 255\)|纯白/);
    expect(prompt).toMatch(/居中|构图|留白/);
    expect(prompt).toMatch(/边缘|抠图/);
    expect(prompt).toMatch(/淘宝|京东|亚马逊|1688/);
  });

  it("studio-polish covers three-light setup, materials, post-processing", () => {
    const prompt = BUILTIN_PRODUCT_RETOUCH_SKILL.promptTemplates["studio-polish"];
    expect(prompt).toMatch(/主光|辅光|轮廓光|key light/);
    expect(prompt).toMatch(/金属|玻璃|织物|皮革/);
    expect(prompt).toMatch(/分频|锐化|颜色分级/);
  });

  it("every mode has explicit ban list with no add / remove / modify", () => {
    for (const mode of ["faithful-retouch", "marketplace-white", "studio-polish"] as const) {
      const prompt = BUILTIN_PRODUCT_RETOUCH_SKILL.promptTemplates[mode];
      expect(prompt, `${mode} should ban watermarks`).toMatch(/水印/);
      expect(prompt, `${mode} should ban logo modifications`).toMatch(/Logo/);
      expect(prompt, `${mode} should ban product modifications`).toMatch(/(?:添加|删除|改变).*(?:产品|文字|文字|结构)/);
      expect(prompt, `${mode} should require product fact preservation`).toMatch(/商品事实/);
    }
  });

  it("every mode has acceptance / verification criteria", () => {
    for (const mode of ["faithful-retouch", "marketplace-white", "studio-polish"] as const) {
      const prompt = BUILTIN_PRODUCT_RETOUCH_SKILL.promptTemplates[mode];
      expect(prompt, `${mode} should define acceptance criteria`).toMatch(/验收标准/);
      expect(prompt, `${mode} should mention sRGB output`).toMatch(/sRGB|RGB 色彩空间/);
    }
  });

  it("category profiles are detailed (each > 40 chars) and contain category-specific details", () => {
    for (const [key, profile] of Object.entries(BUILTIN_PRODUCT_RETOUCH_SKILL.categoryProfiles)) {
      expect(profile.prompt.length, `${key} prompt too short`).toBeGreaterThan(40);
    }
    expect(BUILTIN_PRODUCT_RETOUCH_SKILL.categoryProfiles.apparel.prompt).toMatch(/面料|版型/);
    expect(BUILTIN_PRODUCT_RETOUCH_SKILL.categoryProfiles.electronics.prompt).toMatch(/接口|按键/);
    expect(BUILTIN_PRODUCT_RETOUCH_SKILL.categoryProfiles.beauty.prompt).toMatch(/成分|净含量/);
    expect(BUILTIN_PRODUCT_RETOUCH_SKILL.categoryProfiles.jewelry.prompt).toMatch(/宝石|镶嵌/);
  });

  it("covers 6 new categories: toys, sports, books, plants, automotive, pet", () => {
    for (const key of ["toys", "sports", "books", "plants", "automotive", "pet"]) {
      expect(BUILTIN_PRODUCT_RETOUCH_SKILL.categoryProfiles, `${key} missing`).toHaveProperty(key);
    }
  });

  it("skill version bumped to 1.1.0", () => {
    expect(BUILTIN_PRODUCT_RETOUCH_SKILL.version).toBe("1.1.0");
  });
});
