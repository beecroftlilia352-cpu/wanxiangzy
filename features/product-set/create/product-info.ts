import type { ProductSetImageType, ProductSetProductProfile } from "@/lib/product-set";

export type ProductAnalysisSource = "idle" | "running" | "ai" | "fallback" | "manual" | "history" | "failed";

export function parseProductInfo(text: string) {
  return {
    name: extractProductField(text, ["产品名称", "商品名称", "品名"]),
    description: extractProductField(text, ["视觉风格", "整组图统一场景", "核心卖点", "商品描述"]),
    audience: extractProductField(text, ["适用人群", "目标受众", "目标人群"]),
    sellingPoints: extractProductField(text, ["核心卖点", "商品卖点", "用户痛点"]),
  };
}

export type ProductInfoFields = ReturnType<typeof parseProductInfo>;

export function splitBriefText(value: string) {
  return value
    .replace(/^\[|\]$/g, "")
    .split(/[,，、;；\n]+/)
    .map((item) => item.replace(/^[-*\s]+/, "").replace(/^\[?痛点\d+[：:]/, "").replace(/^\d+[.)、]?\s*/, "").replace(/\]?$/, "").trim())
    .filter((item) => item && item.length <= 24);
}

export function resolveAnalysisSource(data: unknown, productInfo: string): ProductAnalysisSource {
  const source = typeof data === "object" && data && (data as { source?: unknown }).source === "ai" ? "ai" : "fallback";
  if (source !== "ai") return "fallback";
  const name = parseProductInfo(productInfo).name;
  return isPlaceholderProductName(name) ? "fallback" : "ai";
}

export function isPlaceholderProductName(name: string) {
  const normalized = name.trim();
  return !normalized || /待分析|待确认|待识别|未识别/.test(normalized);
}

export function getAnalysisFallbackMessage(reason: unknown) {
  const value = typeof reason === "string" ? reason : "";
  if (value === "missing_api_key" || value === "missing_base_url") return "视觉分析服务没有配置完成，当前展示的是基础模板信息。";
  if (value.startsWith("api_")) return `视觉分析接口返回 ${value.replace("api_", "")}，当前展示的是基础模板信息。`;
  if (value.startsWith("all_failed:")) return "视觉分析没有拿到可用结果，已暂停生成。请重试分析或手动确认商品名称与类目。";
  return "没有拿到可靠的视觉分析结果，已暂停生成。请重试或手动补充商品名称与类目。";
}

export function getProductAnalysisStatus(params: { source: ProductAnalysisSource; hasProductInfo: boolean; message: string }) {
  if (params.source === "running") {
    return {
      tone: "running" as const,
      title: "正在分析商品图",
      description: "正在识别商品名称、类目、卖点和适合的套图计划。",
      message: "分析完成前已禁用生成按钮，避免用不完整信息提交。",
      metric: "分析中",
    };
  }
  if (params.source === "fallback") {
    return {
      tone: "warning" as const,
      title: "未完成视觉分析",
      description: "已填入基础商品信息，但还没有识别出具体商品。",
      message: params.message || "当前不是完整识别结果，生成按钮已暂停；请重新分析或手动补充商品名称。",
      metric: "待确认",
    };
  }
  if (params.source === "failed") {
    return {
      tone: "error" as const,
      title: "分析失败",
      description: "商品分析失败，可重新分析或手动填写。",
      message: params.message || "分析接口没有返回可用结果。",
      metric: "失败",
    };
  }
  if (params.source === "ai") {
    return {
      tone: "quiet" as const,
      title: "分析已完成",
      description: "已生成结构化商品信息，可继续编辑。",
      message: "",
      metric: "已完成",
    };
  }
  if (params.source === "manual") {
    return {
      tone: "quiet" as const,
      title: "手动信息",
      description: "已使用手动填写的商品信息。",
      message: "",
      metric: "手动",
    };
  }
  if (params.source === "history") {
    return {
      tone: "quiet" as const,
      title: "历史参数",
      description: "已套用历史商品信息，可继续编辑。",
      message: "",
      metric: "历史",
    };
  }
  return {
    tone: "quiet" as const,
    title: "待分析",
    description: params.hasProductInfo ? "已填写商品信息，点击帮我写可继续优化规划。" : "可以先写一句需求，也可以上传商品图后点帮我写。",
    message: "",
    metric: params.hasProductInfo ? "已填写" : "未填写",
  };
}

export type ProductAnalysisStatus = ReturnType<typeof getProductAnalysisStatus>;

export function getDefaultGenerationCount(imageType: ProductSetImageType, profile?: ProductSetProductProfile) {
  if (imageType === "main") return 3;
  if (!profile) return 5;
  if (profile.kind === "electronics" || profile.kind === "home") return 7;
  if (profile.apparelType === "intimate" || profile.apparelType === "swimwear") return 5;
  if (profile.apparelType === "outerwear" || profile.apparelType === "sportswear") return 5;
  return 5;
}

export function formatMissingInfo(value: string) {
  const map: Record<string, string> = {
    brand_name: "品牌名",
    product_name: "商品名",
    selling_points: "核心卖点",
    product_size: "尺码/尺寸",
    target_audience: "目标人群",
    model_image: "模特图",
    face_reference: "人脸参考",
    background_reference: "背景参考",
    logo: "Logo",
  };
  return map[value] || value;
}

function extractProductField(text: string, labels: string[] | string) {
  const candidates = Array.isArray(labels) ? labels : [labels];
  const allLabels = [
    "目标平台",
    "风格名称",
    "视觉风格",
    "整组图统一场景",
    "产品信息",
    "产品名称",
    "商品名称",
    "品名",
    "核心卖点",
    "用户痛点",
    "适用人群",
    "目标受众",
    "目标人群",
    "产品参数",
    "商品描述",
    "商品卖点",
    "设计风格",
    "主题配色",
    "用户需求原文",
  ];
  const escapedNextLabels = allLabels.map(escapeRegExp).join("|");
  for (const label of candidates) {
    const escapedLabel = escapeRegExp(label);
    const inlineMatch = text.match(new RegExp(`(?:\\*\\*)?${escapedLabel}\\s*[:：](?:\\*\\*)?\\s*([^\\n]+)`));
    if (inlineMatch?.[1]?.trim()) return inlineMatch[1].trim();
    const blockMatch = text.match(new RegExp(`(?:^|\\n)#{1,3}\\s*${escapedLabel}\\s*\\n([\\s\\S]*?)(?=\\n#{1,3}\\s*(?:${escapedNextLabels})\\s*\\n|\\n(?:\\*\\*)?(?:${escapedNextLabels})(?:\\*\\*)?\\s*[:：]|$)`));
    const value = blockMatch?.[1]?.trim();
    if (value) return value;
  }
  return "";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
