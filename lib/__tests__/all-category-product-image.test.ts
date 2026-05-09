import { describe, expect, it } from "vitest";
import {
  ALL_CATEGORY_PRODUCT_IMAGE_LANGUAGES,
  ALL_CATEGORY_PRODUCT_IMAGE_PLATFORMS,
  DEFAULT_ALL_CATEGORY_PRODUCT_IMAGE_LANGUAGE,
  DEFAULT_ALL_CATEGORY_PRODUCT_IMAGE_PLATFORM,
  createAllCategoryImagePlan,
  generateAllCategoryAiWritingPlans,
  generateAllCategoryDesignSpecMarkdown,
  parseAllCategoryProductInfo,
} from "@/lib/all-category-product-image";

const PRODUCT_INFO = [
  "商品名称：高腰修身牛仔裤",
  "品类：女装裤装",
  "卖点：高腰显瘦、弹力面料、通勤百搭",
  "痛点：担心腿型不直、担心尺码不准",
  "适用人群：通勤女性、小个子用户",
  "参数：蓝色、S-XL、棉混纺",
  "细节：金属纽扣、后袋走线、微喇裤脚",
  "用户需求：做一组适合电商上架的商品图",
].join("\n");

describe("all-category product image helpers", () => {
  it("exposes the requested default platform and language options", () => {
    expect(DEFAULT_ALL_CATEGORY_PRODUCT_IMAGE_PLATFORM).toBe("智能匹配");
    expect(ALL_CATEGORY_PRODUCT_IMAGE_PLATFORMS).toEqual([
      "智能匹配",
      "淘宝",
      "天猫",
      "拼多多",
      "京东",
      "抖音",
      "亚马逊",
      "TEMU",
      "eBay",
      "SHEIN",
      "Shopee",
      "Lazada",
      "TikTok",
    ]);

    expect(DEFAULT_ALL_CATEGORY_PRODUCT_IMAGE_LANGUAGE).toBe("无文字(纯视觉)");
    expect(ALL_CATEGORY_PRODUCT_IMAGE_LANGUAGES).toEqual([
      "无文字(纯视觉)",
      "中文(简体)",
      "中文(繁体)",
      "英语",
      "日语",
      "韩语",
      "德语",
      "法语",
      "意大利语",
      "阿拉伯语",
      "俄语",
      "泰语",
      "印尼语",
    ]);
  });

  it("parses product info into reusable fields", () => {
    const summary = parseAllCategoryProductInfo(PRODUCT_INFO);

    expect(summary).toMatchObject({
      productName: "高腰修身牛仔裤",
      category: "女装裤装",
      userNeed: "做一组适合电商上架的商品图",
    });
    expect(summary.sellingPoints).toContain("高腰显瘦");
    expect(summary.parameters).toContain("S-XL");
  });

  it("generates three main-image markdown proposals with required headings", () => {
    const plans = generateAllCategoryAiWritingPlans({
      imageType: "main",
      productInfo: PRODUCT_INFO,
      analysis: "主图分析结果：需要突出版型、材质和平台转化。",
      platform: "淘宝",
      language: "中文(简体)",
    });

    expect(plans).toHaveLength(3);
    expect(plans[0]).toContain("## 方案 1｜主图分析结果");
    expect(plans[0]).toContain("### 目标平台");
    expect(plans[0]).toContain("淘宝");
    expect(plans[0]).toContain("### 风格名称");
    expect(plans[0]).toContain("### 视觉风格");
    expect(plans[0]).toContain("### 产品信息");
    expect(plans[0]).toContain("### 用户痛点");
    expect(plans[0]).toContain("### 关键细节");
    expect(plans[0]).toContain("### 用户需求原文");
  });

  it("generates three detail-page proposals with scenario heading", () => {
    const plans = generateAllCategoryAiWritingPlans({
      imageType: "details",
      productInfo: PRODUCT_INFO,
      platform: "SHEIN",
    });

    expect(plans).toHaveLength(3);
    expect(plans[0]).toContain("## 方案 1｜详情页分析结果");
    expect(plans[0]).toContain("### 整组图统一场景");
  });

  it("creates four default detail image planning items", () => {
    const detailsPlan = createAllCategoryImagePlan("details");

    expect(detailsPlan).toHaveLength(4);
    expect(detailsPlan.map((item) => item.title)).toEqual([
      "封面主视觉图",
      "细节质感展示",
      "修身廓形解析",
      "规格与尺码参考",
    ]);
    expect(detailsPlan[0]).toEqual(expect.objectContaining({
      id: "details-1",
      description: expect.any(String),
      detailPrompt: expect.any(String),
    }));
  });

  it("creates three default main image planning items", () => {
    expect(createAllCategoryImagePlan("main")).toHaveLength(3);
  });

  it("includes the product consistency constraint in the global design spec", () => {
    const spec = generateAllCategoryDesignSpecMarkdown({
      imageType: "details",
      productInfo: PRODUCT_INFO,
      platform: "京东",
      language: "无文字(纯视觉)",
    });

    expect(spec).toContain("严格还原参考图中产品所有细节");
    expect(spec).toContain("### 视觉风格");
    expect(spec).toContain("### 色彩系统");
    expect(spec).toContain("### 字体系统");
    expect(spec).toContain("### 品质要求");
  });
});
