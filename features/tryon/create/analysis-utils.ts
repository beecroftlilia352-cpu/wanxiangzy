import { TRYON_AGE_GROUP_LABELS, type TryOnAgeGroup } from "@/lib/tryon-prompt";
import { TRYON_CATEGORY_BY_CODE, type TryOnClothingAnalysis } from "@/lib/tryon-reference-config";
import type { TryOnReferenceAnalysis, TryOnReferenceBodyCrop } from "@/lib/tryon-reference-analysis";
import type { TryOnClothingRole } from "@/lib/tryon-upload-rules";
import {
  CLOTHING_ANALYSIS_CLIENT_CACHE_MIN_CONFIDENCE,
  REFERENCE_ANALYSIS_CLIENT_CACHE_MIN_CONFIDENCE,
} from "./constants";
import type { ClothingAnalysisCacheEntry, ReferenceAnalysisCacheEntry } from "./types";

const TRYON_REFERENCE_BODY_CROP_LABELS: Record<TryOnReferenceBodyCrop, string> = {
  full_body: "全身",
  three_quarter: "七分身",
  upper_body: "上半身",
  lower_body: "下半身局部",
  closeup: "局部特写",
  scene_only: "纯场景",
  partial_unknown: "局部未知",
};

export function getClothingAnalysisLabel(analysis: TryOnClothingAnalysis | null) {
  if (!analysis) return "";
  const categoryCode = analysis.subcategories[0] || analysis.mainCategory || "";
  const category = categoryCode ? TRYON_CATEGORY_BY_CODE.get(categoryCode) : null;
  const audienceLabel = analysis.genderType === "men" ? "男装" : analysis.genderType === "unisex" ? "通用" : "女装";
  const ageLabel = analysis.ageRange === "adult" || !analysis.ageRange ? "成人" : TRYON_AGE_GROUP_LABELS[analysis.ageRange as TryOnAgeGroup] || "成人";
  return [category?.nameZh || categoryCode, audienceLabel, ageLabel].filter(Boolean).join(" / ");
}

export function getReferenceAnalysisSummary(analysis: TryOnReferenceAnalysis | null | undefined, options?: { fallback?: boolean }) {
  if (!analysis) return "";
  if (options?.fallback) return "识别不可用 / 保持原图构图";
  const parts = [TRYON_REFERENCE_BODY_CROP_LABELS[analysis.bodyCrop] || "参考图"];
  if (analysis.personVisible) {
    parts.push(analysis.faceVisible ? "露脸" : "无脸");
    if (!analysis.headVisible) parts.push("无头部");
    if (analysis.upperBodyVisible && !analysis.lowerBodyVisible) parts.push("只见上身");
    if (!analysis.upperBodyVisible && analysis.lowerBodyVisible) parts.push("只见下身");
    if (analysis.handsVisible) parts.push("手部可见");
    if (analysis.feetVisible) parts.push("脚部可见");
  } else {
    parts.push("无人像");
  }
  return parts.slice(0, 4).join(" · ");
}

export function getReferenceAnalysisDetailText(analysis: TryOnReferenceAnalysis | null | undefined, options?: { fallback?: boolean; reasonText?: string | null }) {
  if (!analysis) return "";
  if (options?.fallback) return formatReadableReason(options.reasonText) || "按原图结构保守处理";
  const details = analysis.detailFocus
    .flatMap(splitReferenceFocusText)
    .map(formatReferenceFocusForDisplay)
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index)
    .slice(0, 4)
    .join("、");
  return details ? `重点：${details}` : "";
}

export function getAutoClothingRoleFromAnalysis(analysis: TryOnClothingAnalysis | null): TryOnClothingRole | null {
  if (!analysis || analysis.confidence < 0.62) return null;
  const scope = analysis.slot;
  if (scope === "lower") return "lower";
  if (scope === "upper" || scope === "outer") return "upper";
  if (scope === "single" || scope === "intimate" || scope === "functional") return "single";

  const main = analysis.mainCategory;
  if (main === "bottom_pants" || main === "bottom_skirt") return "lower";
  if (main === "single_piece_top" || main === "outerwear") return "upper";
  if (main === "dress" || main === "underwear" || main === "sports_wear" || main === "functional_wear") return "single";
  return null;
}

export function isCacheableClothingAnalysisEntry(entry: ClothingAnalysisCacheEntry) {
  return entry.source !== "fallback"
    && Boolean(entry.analysis)
    && (entry.analysis?.confidence || 0) >= CLOTHING_ANALYSIS_CLIENT_CACHE_MIN_CONFIDENCE;
}

export function isCacheableReferenceAnalysisEntry(entry: ReferenceAnalysisCacheEntry, expectedCount: number) {
  return entry.source !== "fallback"
    && entry.analyses.length === expectedCount
    && entry.analyses.every((analysis) => analysis.confidence >= REFERENCE_ANALYSIS_CLIENT_CACHE_MIN_CONFIDENCE);
}

function splitReferenceFocusText(value: string) {
  if (/(lighting|shadow|studio[-\s]?like|diffused|harsh)/i.test(value)) return [value.trim()].filter(Boolean);
  return value
    .split(/[，,；;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatReferenceFocusForDisplay(value: string) {
  const text = value.trim();
  if (!text) return "";
  if (isChineseDisplayText(text)) return clampDisplayText(text, 24);

  const normalized = text.toLowerCase().replace(/[_-]+/g, " ");
  if (!/[a-z]/.test(normalized)) return clampDisplayText(text, 18);

  const lighting = summarizeReferenceLighting(normalized);
  if (lighting) return lighting;

  const framing = summarizeReferenceFraming(normalized);
  if (framing) return framing;

  const colors = getReferenceColorLabels(normalized);
  const materials = getReferenceLabels(normalized, [
    [/tweed/, "粗花呢"],
    [/denim/, "牛仔"],
    [/lace/, "蕾丝"],
    [/leather/, "皮革"],
    [/knit|knitted/, "针织"],
    [/satin|silk/, "缎面"],
    [/chiffon/, "雪纺"],
    [/cotton/, "棉质"],
    [/wool/, "羊毛"],
  ]);
  const cuts = getReferenceLabels(normalized, [
    [/short sleeve|short sleeved/, "短袖"],
    [/long sleeve|long sleeved/, "长袖"],
    [/sleeveless/, "无袖"],
    [/pointed toe|pointed toe/, "尖头"],
    [/chain strap/, "链条肩带"],
    [/lettering|logo/, "字母"],
  ]);
  const item = getFirstReferenceLabel(normalized, [
    [/midi dress/, "中长连衣裙"],
    [/mini dress/, "短款连衣裙"],
    [/\bdress\b/, "连衣裙"],
    [/\btights?\b|stockings?/, "连裤袜"],
    [/heels?|pumps?|shoes?|boots?/, "鞋"],
    [/\bbag\b|clutch|purse|handbag/, "包"],
    [/bracelet/, "手链"],
    [/necklace/, "项链"],
    [/earrings?/, "耳饰"],
    [/strap/, "肩带"],
    [/skirt/, "半裙"],
    [/jeans/, "牛仔裤"],
    [/pants|trousers/, "裤装"],
    [/shirt|blouse/, "衬衫"],
    [/t shirt|tee\b/, "T 恤"],
    [/jacket|coat|blazer/, "外套"],
    [/\btop\b/, "上衣"],
  ]);
  const parts = [...colors.slice(0, 2), ...materials.slice(0, 1), ...cuts.slice(0, 2), item].filter(Boolean);
  return parts.length ? Array.from(new Set(parts)).join("") : "";
}

function summarizeReferenceLighting(text: string) {
  if (!/(lighting|shadow|studio like|studio-like|soft|diffused|harsh|daylight|natural light)/.test(text)) return "";
  const parts: string[] = [];
  if (/soft|diffused|diffuse/.test(text)) parts.push("柔和");
  if (/even|balanced/.test(text)) parts.push("均匀");
  if (/studio/.test(text)) parts.push("棚拍光");
  if (/minimal\s+harsh\s+shadow|minimal\s+shadow|few\s+shadow|low\s+shadow/.test(text)) parts.push("少阴影");
  if (/natural|daylight/.test(text)) parts.push("自然光");
  if (/warm/.test(text)) parts.push("暖调");
  if (/cool/.test(text)) parts.push("冷调");
  return parts.length ? Array.from(new Set(parts)).join("") : "光线已识别";
}

function summarizeReferenceFraming(text: string) {
  if (!/(shot|framing|composition|crop|view|body)/.test(text)) return "";
  if (/full\s*body|head\s*to\s*toe|whole\s*body/.test(text)) return "全身构图";
  if (/three\s*quarter|3\/4/.test(text)) return "七分身构图";
  if (/upper\s*body|half\s*body/.test(text)) return "上半身构图";
  if (/lower\s*body/.test(text)) return "下半身构图";
  if (/close\s*up|detail|macro/.test(text)) return "局部特写";
  return "";
}

function getReferenceColorLabels(text: string) {
  const labels: string[] = [];
  const push = (pattern: RegExp, label: string) => {
    if (pattern.test(text)) labels.push(label);
  };
  push(/light\s+blue|pale\s+blue|sky\s+blue/, "浅蓝");
  push(/dark\s+blue|navy/, "深蓝");
  if (!labels.some((label) => label.includes("蓝"))) push(/\bblue\b/, "蓝色");
  push(/ivory|cream|off\s*white/, "米白");
  push(/\bwhite\b/, "白色");
  push(/\bblack\b/, "黑色");
  push(/burgundy|wine\s+red|dark\s+red/, "酒红");
  push(/\bred\b/, "红色");
  push(/\bgold|golden\b/, "金色");
  push(/silver/, "银色");
  push(/gray|grey/, "灰色");
  push(/beige|khaki|tan/, "米色");
  push(/pink/, "粉色");
  push(/green/, "绿色");
  push(/brown/, "棕色");
  push(/yellow/, "黄色");
  push(/purple|violet/, "紫色");
  return Array.from(new Set(labels));
}

function getReferenceLabels(text: string, rules: Array<[RegExp, string]>) {
  return Array.from(new Set(rules.flatMap(([pattern, label]) => pattern.test(text) ? [label] : [])));
}

function getFirstReferenceLabel(text: string, rules: Array<[RegExp, string]>) {
  return rules.find(([pattern]) => pattern.test(text))?.[1] || "";
}

function formatReadableReason(value: string | null | undefined) {
  const text = (value || "").trim();
  if (!text) return "";
  return isChineseDisplayText(text) ? clampDisplayText(text, 36) : "";
}

function isChineseDisplayText(value: string) {
  return /[\u3400-\u9fff]/.test(value) && !/[A-Za-z]{4,}/.test(value);
}

function clampDisplayText(value: string, maxLength: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}
