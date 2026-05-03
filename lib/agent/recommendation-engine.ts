import type { GarmentAnalysis, RecommendedPlan } from "./types";
import { getCreditCost, type LingyaModel, type ImageSize, type AspectRatio } from "@/lib/api/lingya";

/**
 * 根据服装分析结果，生成推荐方案列表。
 * 纯客户端逻辑，不调用 API。
 */
export function generateRecommendations(analysis: GarmentAnalysis): RecommendedPlan[] {
  const plans: RecommendedPlan[] = [];
  const model: LingyaModel = "gpt-image-2";
  const size: ImageSize = "1K";
  const ratio: AspectRatio = "3:4";
  const cost = getCreditCost(model, size, ratio);

  // 方案 1：电商主图（始终推荐）
  plans.push({
    id: "ecommerce-main",
    icon: "Shirt",
    title: "电商主图",
    description: `服装上身 · ${ratio} · 电商白底`,
    modules: ["tryon"],
    params: {
      ai_model: model,
      aspect_ratio: ratio,
      image_size: size,
      gen_count: 1,
      style: getRecommendedStyle(analysis, "ecommerce"),
    },
    creditsPerItem: cost,
    isRecommended: true,
    aiReason: getAiReason(analysis, "ecommerce"),
  });

  // 方案 2：种草图
  plans.push({
    id: "social-content",
    icon: "Heart",
    title: "种草图",
    description: `种草图 · ${ratio} · ${getRecommendedScene(analysis)}`,
    modules: ["grass"],
    params: {
      ai_model: model,
      aspect_ratio: ratio,
      image_size: size,
      gen_count: 1,
      template_id: getRecommendedTemplate(analysis),
      scene_mode: "auto",
    },
    creditsPerItem: cost,
    isRecommended: analysis.category === "连衣裙" || analysis.category === "上装",
    aiReason: getAiReason(analysis, "social"),
  });

  // 方案 3：服装 3D
  plans.push({
    id: "garment-3d",
    icon: "Box",
    title: "3D 展示",
    description: `3D 立体 · ${ratio} · 棚拍质感`,
    modules: ["garment_3d"],
    params: {
      ai_model: model,
      aspect_ratio: ratio,
      image_size: size,
      gen_count: 1,
    },
    creditsPerItem: cost,
    isRecommended: false,
  });

  // 方案 4：全套方案（多步骤）
  plans.push({
    id: "full-package",
    icon: "Layers3",
    title: "全套方案",
    description: `主图 + 种草 + 3D · ${cost * 3} 积分`,
    modules: ["tryon", "grass", "garment_3d"],
    params: {
      ai_model: model,
      aspect_ratio: ratio,
      image_size: size,
      gen_count: 1,
    },
    creditsPerItem: cost * 3,
    isRecommended: false,
    aiReason: "一站式生成商品主图、种草内容和 3D 展示",
  });

  return plans;
}

/**
 * 根据品类和场景推荐风格
 */
function getRecommendedStyle(analysis: GarmentAnalysis, context: string): string {
  if (context === "ecommerce") {
    if (analysis.style === "甜美" || analysis.style === "韩系") return "韩系清透";
    if (analysis.style === "复古") return "时尚杂志";
    if (analysis.style === "运动") return "电商白底";
    return "电商白底";
  }
  return "";
}

function getRecommendedScene(analysis: GarmentAnalysis): string {
  if (analysis.style === "甜美" || analysis.style === "韩系") return "咖啡店";
  if (analysis.style === "复古") return "街拍";
  if (analysis.category === "外套") return "街拍";
  return "街拍";
}

function getRecommendedTemplate(analysis: GarmentAnalysis): string {
  if (analysis.style === "甜美" || analysis.style === "韩系") return "cafe";
  if (analysis.style === "运动") return "street";
  return "street";
}

function getAiReason(analysis: GarmentAnalysis, context: string): string {
  const { category, style, colors, season } = analysis;
  const colorStr = colors.length > 0 ? colors.join("") : "";

  if (context === "ecommerce") {
    if (category === "连衣裙") return `${colorStr}${category}适合韩系清透风格，突出面料质感`;
    if (category === "上装") return `${colorStr}${category}建议电商白底展示，清晰呈现版型细节`;
    if (category === "外套") return `${category}建议杂志风格拍摄，突出廓形和质感`;
    return `${season}${colorStr}${category}，电商主图最能展示服装细节`;
  }

  if (context === "social") {
    if (style === "甜美" || style === "韩系") return `${style}风格穿搭，咖啡店场景最出片`;
    if (category === "连衣裙") return `连衣裙街拍种草效果最好，适合小红书投放`;
    return `街拍场景自然真实，种草转化率高`;
  }

  return "";
}
