import { describe, expect, it } from "vitest";
import {
  BUILTIN_PRODUCT_RETOUCH_SKILL,
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
  it("keeps the product image navigation order stable", () => {
    const items = getFeatureItemsForModule("productImages");
    expect(items.map((item) => item.key)).toEqual([
      "productRetouch",
      "productSet",
      "allCategoryProductImage",
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
      "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/product-retouch-examples/",
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
      limits: { maxSources: 31, maxVariantsPerSource: 4 },
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
