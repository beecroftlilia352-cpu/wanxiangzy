import type { ProductSetImageType, ProductSetProductProfile } from "@/lib/product-set";

export type ProductAnalysisSource = "idle" | "running" | "ai" | "fallback" | "manual" | "history" | "failed";

type Translate = (key: string, values?: Record<string, string | number>) => string;

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

export function getAnalysisFallbackMessage(reason: unknown, t: Translate) {
  const value = typeof reason === "string" ? reason : "";
  if (value === "missing_api_key" || value === "missing_base_url") return t("analysis.fallbackMessage.missingConfig");
  if (value.startsWith("api_")) return t("analysis.fallbackMessage.apiError", { code: value.replace("api_", "") });
  if (value.startsWith("all_failed:")) return t("analysis.fallbackMessage.allFailed");
  return t("analysis.fallbackMessage.default");
}

export function getProductAnalysisStatus(params: { source: ProductAnalysisSource; hasProductInfo: boolean; message: string }, t: Translate) {
  if (params.source === "running") {
    return {
      tone: "running" as const,
      title: t("analysis.status.running.title"),
      description: t("analysis.status.running.description"),
      message: t("analysis.status.running.message"),
      metric: t("analysis.status.running.metric"),
    };
  }
  if (params.source === "fallback") {
    return {
      tone: "warning" as const,
      title: t("analysis.status.fallback.title"),
      description: t("analysis.status.fallback.description"),
      message: params.message || t("analysis.status.fallback.message"),
      metric: t("analysis.status.fallback.metric"),
    };
  }
  if (params.source === "failed") {
    return {
      tone: "error" as const,
      title: t("analysis.status.failed.title"),
      description: t("analysis.status.failed.description"),
      message: params.message || t("analysis.status.failed.message"),
      metric: t("analysis.status.failed.metric"),
    };
  }
  if (params.source === "ai") {
    return {
      tone: "quiet" as const,
      title: t("analysis.status.ai.title"),
      description: t("analysis.status.ai.description"),
      message: "",
      metric: t("analysis.status.ai.metric"),
    };
  }
  if (params.source === "manual") {
    return {
      tone: "quiet" as const,
      title: t("analysis.status.manual.title"),
      description: t("analysis.status.manual.description"),
      message: "",
      metric: t("analysis.status.manual.metric"),
    };
  }
  if (params.source === "history") {
    return {
      tone: "quiet" as const,
      title: t("analysis.status.history.title"),
      description: t("analysis.status.history.description"),
      message: "",
      metric: t("analysis.status.history.metric"),
    };
  }
  return {
    tone: "quiet" as const,
    title: t("analysis.status.idle.title"),
    description: params.hasProductInfo ? t("analysis.status.idle.description.filled") : t("analysis.status.idle.description.empty"),
    message: "",
    metric: params.hasProductInfo ? t("analysis.status.idle.metric.filled") : t("analysis.status.idle.metric.empty"),
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

export function formatMissingInfo(value: string, t: Translate) {
  const keyMap: Record<string, string> = {
    brand_name: "analysis.missingInfo.brandName",
    product_name: "analysis.missingInfo.productName",
    selling_points: "analysis.missingInfo.sellingPoints",
    product_size: "analysis.missingInfo.productSize",
    target_audience: "analysis.missingInfo.targetAudience",
    model_image: "analysis.missingInfo.modelImage",
    face_reference: "analysis.missingInfo.faceReference",
    background_reference: "analysis.missingInfo.backgroundReference",
    logo: "analysis.missingInfo.logo",
  };
  return keyMap[value] ? t(keyMap[value]) : value;
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
