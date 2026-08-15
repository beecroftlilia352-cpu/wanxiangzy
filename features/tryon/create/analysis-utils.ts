import { TRYON_CATEGORY_BY_CODE, type TryOnClothingAnalysis } from "@/lib/tryon-reference-config";
import type { TryOnReferenceAnalysis, TryOnReferenceBodyCrop } from "@/lib/tryon-reference-analysis";
import type { TryOnClothingRole } from "@/lib/tryon-upload-rules";
import {
  CLOTHING_ANALYSIS_CLIENT_CACHE_MIN_CONFIDENCE,
  REFERENCE_ANALYSIS_CLIENT_CACHE_MIN_CONFIDENCE,
} from "./constants";
import type { ClothingAnalysisCacheEntry, ReferenceAnalysisCacheEntry } from "./types";

type Translate = (key: string, values?: Record<string, string | number>) => string;

const TRYON_REFERENCE_BODY_CROP_KEYS: Record<TryOnReferenceBodyCrop, string> = {
  full_body: "analysisLabels.bodyCrop.fullBody",
  three_quarter: "analysisLabels.bodyCrop.threeQuarter",
  upper_body: "analysisLabels.bodyCrop.upperBody",
  lower_body: "analysisLabels.bodyCrop.lowerBody",
  closeup: "analysisLabels.bodyCrop.closeup",
  scene_only: "analysisLabels.bodyCrop.sceneOnly",
  partial_unknown: "analysisLabels.bodyCrop.partialUnknown",
};

export function getClothingAnalysisLabel(analysis: TryOnClothingAnalysis | null, t: Translate, locale = "zh") {
  if (!analysis) return "";
  const categoryCode = analysis.subcategories[0] || analysis.mainCategory || "";
  const category = categoryCode ? TRYON_CATEGORY_BY_CODE.get(categoryCode) : null;
  const audienceKey = analysis.genderType === "men" ? "audience.garment.men" : analysis.genderType === "unisex" ? "analysisLabels.gender.unisex" : "audience.garment.women";
  const ageKey = analysis.ageRange && analysis.ageRange !== "all" ? `audience.age.${analysis.ageRange}` : "audience.age.adult";
  const isZh = locale === "zh" || locale === "zh-TW";
  const categoryLabel = category ? (isZh ? category.nameZh : category.nameEn || category.nameZh) : categoryCode;
  return [categoryLabel, t(audienceKey), t(ageKey)].filter(Boolean).join(" / ");
}

export function getReferenceAnalysisSummary(analysis: TryOnReferenceAnalysis | null | undefined, t: Translate, options?: { fallback?: boolean }) {
  if (!analysis) return "";
  if (options?.fallback) return t("analysisLabels.summary.fallback");
  const parts = [t(TRYON_REFERENCE_BODY_CROP_KEYS[analysis.bodyCrop] || "analysisLabels.summary.referenceImage")];
  if (analysis.personVisible) {
    parts.push(t(analysis.faceVisible ? "analysisLabels.part.faceVisible" : "analysisLabels.part.noFace"));
    if (!analysis.headVisible) parts.push(t("analysisLabels.part.noHead"));
    if (analysis.upperBodyVisible && !analysis.lowerBodyVisible) parts.push(t("analysisLabels.part.upperOnly"));
    if (!analysis.upperBodyVisible && analysis.lowerBodyVisible) parts.push(t("analysisLabels.part.lowerOnly"));
    if (analysis.handsVisible) parts.push(t("analysisLabels.part.handsVisible"));
    if (analysis.feetVisible) parts.push(t("analysisLabels.part.feetVisible"));
  } else {
    parts.push(t("analysisLabels.part.noPerson"));
  }
  return parts.slice(0, 4).join(" · ");
}

export function getReferenceAnalysisDetailText(analysis: TryOnReferenceAnalysis | null | undefined, t: Translate, options?: { fallback?: boolean; reasonText?: string | null }) {
  if (!analysis) return "";
  if (options?.fallback) return formatReadableReason(options.reasonText) || t("analysisLabels.fallbackDefault");
  const details = analysis.detailFocus
    .flatMap(splitReferenceFocusText)
    .map((item) => formatReferenceFocusForDisplay(item, t))
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index)
    .slice(0, 4)
    .join(t("analysisLabels.listSeparator"));
  return details ? t("analysisLabels.focusPrefix", { details }) : "";
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

function formatReferenceFocusForDisplay(value: string, t: Translate) {
  const text = value.trim();
  if (!text) return "";
  if (isChineseDisplayText(text)) return clampDisplayText(text, 24);

  const normalized = text.toLowerCase().replace(/[_-]+/g, " ");
  if (!/[a-z]/.test(normalized)) return clampDisplayText(text, 18);

  const lighting = summarizeReferenceLighting(normalized, t);
  if (lighting) return lighting;

  const framing = summarizeReferenceFraming(normalized, t);
  if (framing) return framing;

  const colors = getReferenceColorLabels(normalized, t);
  const materials = getReferenceLabels(normalized, [
    [/tweed/, "analysisLabels.material.tweed"],
    [/denim/, "analysisLabels.material.denim"],
    [/lace/, "analysisLabels.material.lace"],
    [/leather/, "analysisLabels.material.leather"],
    [/knit|knitted/, "analysisLabels.material.knit"],
    [/satin|silk/, "analysisLabels.material.satin"],
    [/chiffon/, "analysisLabels.material.chiffon"],
    [/cotton/, "analysisLabels.material.cotton"],
    [/wool/, "analysisLabels.material.wool"],
  ], t);
  const cuts = getReferenceLabels(normalized, [
    [/short sleeve|short sleeved/, "analysisLabels.cut.shortSleeve"],
    [/long sleeve|long sleeved/, "analysisLabels.cut.longSleeve"],
    [/sleeveless/, "analysisLabels.cut.sleeveless"],
    [/pointed toe|pointed toe/, "analysisLabels.cut.pointedToe"],
    [/chain strap/, "analysisLabels.cut.chainStrap"],
    [/lettering|logo/, "analysisLabels.cut.lettering"],
  ], t);
  const item = getFirstReferenceLabel(normalized, [
    [/midi dress/, "analysisLabels.item.midiDress"],
    [/mini dress/, "analysisLabels.item.miniDress"],
    [/\bdress\b/, "analysisLabels.item.dress"],
    [/\btights?\b|stockings?/, "analysisLabels.item.tights"],
    [/heels?|pumps?|shoes?|boots?/, "analysisLabels.item.shoes"],
    [/\bbag\b|clutch|purse|handbag/, "analysisLabels.item.bag"],
    [/bracelet/, "analysisLabels.item.bracelet"],
    [/necklace/, "analysisLabels.item.necklace"],
    [/earrings?/, "analysisLabels.item.earrings"],
    [/strap/, "analysisLabels.item.strap"],
    [/skirt/, "analysisLabels.item.skirt"],
    [/jeans/, "analysisLabels.item.jeans"],
    [/pants|trousers/, "analysisLabels.item.pants"],
    [/shirt|blouse/, "analysisLabels.item.shirt"],
    [/t shirt|tee\b/, "analysisLabels.item.tShirt"],
    [/jacket|coat|blazer/, "analysisLabels.item.jacket"],
    [/\btop\b/, "analysisLabels.item.top"],
  ], t);
  const parts = [...colors.slice(0, 2), ...materials.slice(0, 1), ...cuts.slice(0, 2), item].filter(Boolean);
  return parts.length ? Array.from(new Set(parts)).join("") : "";
}

function summarizeReferenceLighting(text: string, t: Translate) {
  if (!/(lighting|shadow|studio like|studio-like|soft|diffused|harsh|daylight|natural light)/.test(text)) return "";
  const parts: string[] = [];
  if (/soft|diffused|diffuse/.test(text)) parts.push(t("analysisLabels.lighting.soft"));
  if (/even|balanced/.test(text)) parts.push(t("analysisLabels.lighting.even"));
  if (/studio/.test(text)) parts.push(t("analysisLabels.lighting.studio"));
  if (/minimal\s+harsh\s+shadow|minimal\s+shadow|few\s+shadow|low\s+shadow/.test(text)) parts.push(t("analysisLabels.lighting.lowShadow"));
  if (/natural|daylight/.test(text)) parts.push(t("analysisLabels.lighting.natural"));
  if (/warm/.test(text)) parts.push(t("analysisLabels.lighting.warm"));
  if (/cool/.test(text)) parts.push(t("analysisLabels.lighting.cool"));
  return parts.length ? Array.from(new Set(parts)).join("") : t("analysisLabels.lighting.recognized");
}

function summarizeReferenceFraming(text: string, t: Translate) {
  if (!/(shot|framing|composition|crop|view|body)/.test(text)) return "";
  if (/full\s*body|head\s*to\s*toe|whole\s*body/.test(text)) return t("analysisLabels.framing.fullBody");
  if (/three\s*quarter|3\/4/.test(text)) return t("analysisLabels.framing.threeQuarter");
  if (/upper\s*body|half\s*body/.test(text)) return t("analysisLabels.framing.upperBody");
  if (/lower\s*body/.test(text)) return t("analysisLabels.framing.lowerBody");
  if (/close\s*up|detail|macro/.test(text)) return t("analysisLabels.framing.closeup");
  return "";
}

function getReferenceColorLabels(text: string, t: Translate) {
  const labels: string[] = [];
  const push = (pattern: RegExp, key: string) => {
    if (pattern.test(text)) labels.push(t(key));
  };
  push(/light\s+blue|pale\s+blue|sky\s+blue/, "analysisLabels.color.lightBlue");
  push(/dark\s+blue|navy/, "analysisLabels.color.darkBlue");
  if (!/(light\s+blue|pale\s+blue|sky\s+blue|dark\s+blue|navy)/i.test(text)) push(/\bblue\b/, "analysisLabels.color.blue");
  push(/ivory|cream|off\s*white/, "analysisLabels.color.ivory");
  push(/\bwhite\b/, "analysisLabels.color.white");
  push(/\bblack\b/, "analysisLabels.color.black");
  push(/burgundy|wine\s+red|dark\s+red/, "analysisLabels.color.burgundy");
  push(/\bred\b/, "analysisLabels.color.red");
  push(/\bgold|golden\b/, "analysisLabels.color.gold");
  push(/silver/, "analysisLabels.color.silver");
  push(/gray|grey/, "analysisLabels.color.gray");
  push(/beige|khaki|tan/, "analysisLabels.color.beige");
  push(/pink/, "analysisLabels.color.pink");
  push(/green/, "analysisLabels.color.green");
  push(/brown/, "analysisLabels.color.brown");
  push(/yellow/, "analysisLabels.color.yellow");
  push(/purple|violet/, "analysisLabels.color.purple");
  return Array.from(new Set(labels));
}

function getReferenceLabels(text: string, rules: Array<[RegExp, string]>, t: Translate) {
  return Array.from(new Set(rules.flatMap(([pattern, key]) => pattern.test(text) ? [t(key)] : [])));
}

function getFirstReferenceLabel(text: string, rules: Array<[RegExp, string]>, t: Translate) {
  return rules.find(([pattern]) => pattern.test(text))?.[1] ? t(rules.find(([pattern]) => pattern.test(text))![1]) : "";
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
