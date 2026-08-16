import {
  TRYON_AGE_GROUP_LABELS,
  type TryOnAgeGroup,
} from "@/lib/tryon-prompt";
import {
  TRYON_GARMENT_AUDIENCE_LABELS,
  type TryOnGarmentAudience,
} from "@/lib/tryon-prompt";
import type { TryOnClothingAnalysis } from "@/lib/tryon-reference-config";
import type { ClothingAnalysisCacheEntry } from "@/features/tryon/create/types";

// 仅当模型/缓存给出的 confidence 高于阈值时才允许自动套用受众建议
export const VISUAL_AUDIENCE_AUTO_CONFIDENCE = 0.86;

const GENDER_TO_AUDIENCE: Partial<Record<NonNullable<TryOnClothingAnalysis["genderType"]>, TryOnGarmentAudience>> = {
  women: "women",
  men: "men",
};

export function getVisualAudienceSuggestion(analysis: TryOnClothingAnalysis | null | undefined) {
  if (!analysis || analysis.confidence < VISUAL_AUDIENCE_AUTO_CONFIDENCE) {
    return { audience: null, ageGroup: null } as const;
  }

  return {
    audience: analysis.genderType ? GENDER_TO_AUDIENCE[analysis.genderType] ?? null : null,
    ageGroup: analysis.ageRange && analysis.ageRange !== "all" ? analysis.ageRange : null,
  } as const;
}

// 仅信任来源为实时识图（yunwu）或本地缓存（cache）的分析结果，避免覆盖用户手动设置
export function canApplyVisualAudienceSuggestion(source: ClothingAnalysisCacheEntry["source"] | null) {
  return source === "yunwu" || source === "cache";
}

export function formatVisualAudienceSuggestion(audience: TryOnGarmentAudience | null, ageGroup: TryOnAgeGroup | null) {
  return [
    audience ? TRYON_GARMENT_AUDIENCE_LABELS[audience] : "",
    ageGroup ? TRYON_AGE_GROUP_LABELS[ageGroup] : "",
  ].filter(Boolean).join(" ");
}

// lib TRYON_CLOTHING_ROLE_LABELS 仅覆盖中文兜底；UI 显示需从 i18n 解析
export const ROLE_I18N_KEYS: Record<string, string> = {
  single: "clothing.roleSingle",
  upper: "clothing.roleUpper",
  lower: "clothing.roleLower",
  extra: "clothing.roleExtra",
};