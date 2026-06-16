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
  return parts.slice(0, 4).join(" / ");
}

export function getReferenceAnalysisDetailText(analysis: TryOnReferenceAnalysis | null | undefined, options?: { fallback?: boolean; reasonText?: string | null }) {
  if (!analysis) return "";
  if (options?.fallback) return options.reasonText || "不会按兜底值判断露脸或头部";
  const details = analysis.detailFocus.slice(0, 3).join("、");
  const confidence = Math.round(analysis.confidence * 100);
  return [details ? `细节：${details}` : "", confidence ? `置信 ${confidence}%` : ""].filter(Boolean).join(" · ");
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
