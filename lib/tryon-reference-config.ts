import { PRESET_REFERENCES } from "@/lib/tryon-studio-options";
import type { TryOnAgeGroup, TryOnGarmentAudience } from "@/lib/tryon-prompt";

export type TryOnClothingSlot = "upper" | "lower" | "single" | "outer" | "intimate" | "functional";
export type TryOnReferenceSceneStatus = "draft" | "active" | "archived";

export type TryOnClothingCategorySeed = {
  code: string;
  parentCode: string | null;
  level: 1 | 2;
  nameZh: string;
  nameEn: string;
  slot: TryOnClothingSlot;
  isIntimate: boolean;
  aliases: string[];
  recognitionLabels: string[];
  defaultViewTags: string[];
  defaultCropTags: string[];
  enabled: boolean;
  sortOrder: number;
  metadata?: Record<string, unknown>;
};

export type TryOnClothingAnalysis = {
  mainCategory: string | null;
  subcategories: string[];
  clothTypeRaw: string;
  desc: string;
  genderType: TryOnGarmentAudience | "unisex" | null;
  ageRange: TryOnAgeGroup | "all" | null;
  slot: TryOnClothingSlot | null;
  fit: "loose" | "fitted" | "regular" | null;
  confidence: number;
  raw?: unknown;
};

export type TryOnReferenceScene = {
  id?: string;
  sceneKey: string;
  externalSceneId?: string | null;
  name: string;
  imageUrl: string;
  status: TryOnReferenceSceneStatus;
  priority: number;
  sortOrder: number;
  clothCategories: string[];
  gender: TryOnGarmentAudience | "unisex" | "all";
  ageRanges: Array<TryOnAgeGroup | "all">;
  viewTags: string[];
  cropTags: string[];
  sceneTags: string[];
  styleTags: string[];
  lens?: string | null;
  posture?: string | null;
  promptTags: string[];
  rawConfig: Record<string, unknown>;
};

export type TryOnReferenceRecommendation = TryOnReferenceScene & {
  score: number;
  matchReasons: string[];
};

export const TRYON_CATEGORY_CONFIG_VERSION = 1;
export const TRYON_REFERENCE_RECOMMENDATION_LIMIT = 48;

const BASE_CATEGORY_SEEDS: TryOnClothingCategorySeed[] = [
  mainCategory("outerwear", "外套", "Outerwear", "outer", 10, [
    subCategory("loose_top", "宽松外套", "Loose outer top", "outer", 11, ["loose top", "loose jacket", "oversized jacket"], ["loose outerwear", "oversized outerwear"]),
    subCategory("fitted_top", "合身外套", "Fitted outer top", "outer", 12, ["fitted jacket", "tailored jacket", "slim jacket"], ["fitted outerwear", "tailored outerwear"]),
    subCategory("overcoat", "大衣", "Overcoat", "outer", 13, ["coat", "overcoat", "trench coat"], ["coat", "long coat", "overcoat"]),
    subCategory("shawl", "披肩", "Shawl", "outer", 14, ["shawl", "wrap", "capelet"], ["shawl", "wrap outerwear"]),
    subCategory("down_jacket", "羽绒服", "Down jacket", "outer", 15, ["down jacket", "puffer", "puffer jacket"], ["down jacket", "puffer jacket"]),
    subCategory("fur_coat", "皮草", "Fur coat", "outer", 16, ["fur coat", "faux fur"], ["fur coat", "faux fur coat"]),
    subCategory("suit_set", "西装多件套", "Suit set", "outer", 17, ["suit", "blazer set", "suit set"], ["suit set", "blazer suit"]),
  ]),
  mainCategory("single_piece_top", "单件上衣", "Single piece top", "upper", 20, [
    subCategory("single_loose_top", "单件宽松款上衣", "Loose single top", "upper", 21, ["loose shirt", "oversized t-shirt", "loose blouse"], ["loose upper garment", "loose top"]),
    subCategory("single_fitted_top", "单件合身款上衣", "Fitted single top", "upper", 22, ["fitted top", "tank top", "sleeveless top", "ribbed top", "slim top"], ["upper garment", "fitted top", "tank top", "sleeveless top"]),
  ]),
  mainCategory("bottom_skirt", "下身裙子", "Bottom skirt", "lower", 30, [
    subCategory("wrap_skirt", "裹身裙", "Wrap skirt", "lower", 31, ["wrap skirt"], ["wrap skirt"]),
    subCategory("wrap_maxi_skirt", "裹身及地裙", "Wrap maxi skirt", "lower", 32, ["wrap maxi skirt", "long wrap skirt"], ["wrap maxi skirt"]),
    subCategory("short_skirt", "短裙", "Short skirt", "lower", 33, ["short skirt", "mini skirt"], ["short skirt", "mini skirt"]),
    subCategory("aline_skirt", "伞裙", "A-line skirt", "lower", 34, ["a-line skirt", "aline skirt", "flared skirt"], ["a-line skirt", "flared skirt"]),
    subCategory("aline_maxi_skirt", "伞裙及地裙", "A-line maxi skirt", "lower", 35, ["a-line maxi skirt", "long flared skirt"], ["a-line maxi skirt"]),
  ]),
  mainCategory("bottom_pants", "下身裤子", "Bottom pants", "lower", 40, [
    subCategory("shorts", "短裤", "Shorts", "lower", 41, ["shorts"], ["shorts"]),
    subCategory("long_pants", "长裤", "Long pants", "lower", 42, ["pants", "trousers", "jeans", "wide leg pants", "long pants"], ["pants", "trousers", "jeans", "long pants"]),
    subCategory("overalls", "背带裤", "Overalls", "single", 43, ["overalls", "dungarees"], ["overalls"]),
  ]),
  mainCategory("dress", "连衣裙", "Dress", "single", 50, [
    subCategory("wrap_short_dress", "裹身短连衣裙", "Wrap short dress", "single", 51, ["short wrap dress"], ["short wrap dress"]),
    subCategory("wrap_dress", "裹身连衣裙", "Wrap dress", "single", 52, ["wrap dress"], ["wrap dress"]),
    subCategory("aline_short_dress", "伞裙短连衣裙", "A-line short dress", "single", 53, ["short a-line dress", "short aline dress"], ["short a-line dress"]),
    subCategory("aline_dress", "伞裙连衣裙", "A-line dress", "single", 54, ["a-line dress", "aline dress", "flared dress"], ["a-line dress"]),
  ]),
  mainCategory("underwear", "内衣裤", "Underwear", "intimate", 60, [
    subCategory("swimsuit", "泳衣", "Swimsuit", "intimate", 61, ["swimsuit", "bikini", "swimwear"], ["swimsuit", "swimwear"], true),
    subCategory("underwear_set", "内衣裤", "Underwear set", "intimate", 62, ["underwear", "bra", "panties"], ["underwear", "underwear set"], true),
    subCategory("sexy_lingerie", "情趣内衣", "Sexy lingerie", "intimate", 63, ["lingerie", "sexy lingerie"], ["lingerie"], true),
  ], true),
  mainCategory("functional_wear", "功能性服装", "Functional wear", "functional", 70, [
    subCategory("cape", "斗篷", "Cape", "outer", 71, ["cape"], ["cape"]),
    subCategory("raincoat", "雨衣", "Raincoat", "outer", 72, ["raincoat"], ["raincoat"]),
    subCategory("costume", "道具类服装", "Costume", "functional", 73, ["costume", "cosplay"], ["costume"]),
    subCategory("ballet_skirt", "芭蕾舞裙", "Ballet skirt", "lower", 74, ["ballet skirt", "tutu"], ["ballet skirt", "tutu"]),
    subCategory("pajamas", "睡衣", "Pajamas", "single", 75, ["pajamas", "pyjamas", "sleepwear"], ["pajamas", "sleepwear"]),
  ]),
  mainCategory("sports_wear", "运动类", "Sports wear", "single", 80, [
    subCategory("yoga_wear", "瑜伽服", "Yoga wear", "single", 81, ["yoga wear", "leggings set", "sports bra"], ["yoga wear"]),
    subCategory("volleyball_uniform", "排球服", "Volleyball uniform", "single", 82, ["volleyball uniform"], ["volleyball uniform"]),
  ]),
].flat();

export const TRYON_CLOTHING_CATEGORY_SEED = BASE_CATEGORY_SEEDS;

export const TRYON_CATEGORY_BY_CODE = new Map(
  TRYON_CLOTHING_CATEGORY_SEED.map((category) => [category.code, category])
);

const CHILDREN_BY_PARENT = TRYON_CLOTHING_CATEGORY_SEED.reduce((map, category) => {
  if (category.parentCode) {
    map.set(category.parentCode, [...(map.get(category.parentCode) || []), category]);
  }
  return map;
}, new Map<string, TryOnClothingCategorySeed[]>());

export const TRYON_MAIN_CATEGORY_CODES = TRYON_CLOTHING_CATEGORY_SEED
  .filter((category) => category.level === 1)
  .map((category) => category.code);

export function normalizeTryOnClothingAnalysis(input: unknown): TryOnClothingAnalysis {
  const record = toRecord(input);
  const clothTypeRaw = readString(record, "clothTypeRaw")
    || readString(record, "cloth_type")
    || readString(record, "clothType")
    || readString(record, "type")
    || "";
  const desc = readString(record, "desc") || readString(record, "description") || "";
  const providedSubcategories = normalizeCategoryCodes(readStringArray(record, "subcategories"));
  const providedMain = normalizeMainCategory(readString(record, "mainCategory") || readString(record, "main_category"));
  const inferred = inferTryOnClothingCategories({
    clothTypeRaw,
    desc,
    categoryHints: providedSubcategories.length ? providedSubcategories : readStringArray(record, "recognition_labels"),
  });
  const subcategories = uniqueStrings([...providedSubcategories, ...inferred.subcategories])
    .filter((code) => TRYON_CATEGORY_BY_CODE.has(code));
  const mainCategory = providedMain || inferred.mainCategory || deriveMainCategory(subcategories[0]) || null;
  const slot = normalizeSlot(readString(record, "slot")) || inferSlot(mainCategory, subcategories) || inferred.slot;
  const genderType = normalizeGender(readString(record, "genderType") || readString(record, "gender_type"));
  const ageRange = normalizeAge(readString(record, "ageRange") || readString(record, "age_range"));
  const fit = normalizeFit(readString(record, "fit")) || inferred.fit;
  const rawConfidence = typeof record.confidence === "number" ? record.confidence : Number(record.confidence);

  return {
    mainCategory,
    subcategories,
    clothTypeRaw,
    desc,
    genderType,
    ageRange,
    slot,
    fit,
    confidence: Number.isFinite(rawConfidence) ? clamp(rawConfidence, 0, 1) : inferred.confidence,
    raw: record.raw ?? input,
  };
}

export function inferTryOnClothingCategories(input: {
  clothTypeRaw?: string;
  desc?: string;
  categoryHints?: string[];
}): Pick<TryOnClothingAnalysis, "mainCategory" | "subcategories" | "slot" | "fit" | "confidence"> {
  const text = normalizeText([input.clothTypeRaw, input.desc, ...(input.categoryHints || [])].filter(Boolean).join(" "));
  const subcategories: string[] = [];
  let mainCategory: string | null = null;

  const has = (...needles: string[]) => needles.some((needle) => text.includes(needle));
  const fit = has("loose", "oversized", "relaxed", "宽松") ? "loose"
    : has("fitted", "slim", "ribbed", "tank", "sleeveless", "合身", "修身", "背心") ? "fitted"
      : "regular";

  if (has("swimsuit", "swimwear", "bikini", "泳衣")) {
    mainCategory = "underwear";
    subcategories.push("swimsuit");
  } else if (has("lingerie", "underwear", "bra", "panties", "内衣")) {
    mainCategory = "underwear";
    subcategories.push(has("lingerie", "情趣") ? "sexy_lingerie" : "underwear_set");
  } else if (has("dress", "gown", "连衣裙")) {
    mainCategory = "dress";
    subcategories.push(has("wrap", "裹身") ? "wrap_dress" : has("short", "mini", "短") ? "aline_short_dress" : "aline_dress");
  } else if (has("skirt", "tutu", "半裙", "裙子")) {
    mainCategory = "bottom_skirt";
    subcategories.push(has("wrap", "裹身") ? (has("maxi", "long", "及地", "长") ? "wrap_maxi_skirt" : "wrap_skirt")
      : has("short", "mini", "短") ? "short_skirt"
        : has("maxi", "long", "及地", "长") ? "aline_maxi_skirt" : "aline_skirt");
  } else if (has("pants", "trousers", "jeans", "shorts", "overalls", "裤")) {
    mainCategory = "bottom_pants";
    subcategories.push(has("shorts", "短裤") ? "shorts" : has("overalls", "背带") ? "overalls" : "long_pants");
  } else if (has("coat", "jacket", "blazer", "outerwear", "puffer", "fur", "shawl", "外套", "大衣", "西装")) {
    mainCategory = "outerwear";
    if (has("puffer", "down", "羽绒")) subcategories.push("down_jacket");
    else if (has("fur", "皮草")) subcategories.push("fur_coat");
    else if (has("suit", "blazer", "西装")) subcategories.push("suit_set");
    else if (has("overcoat", "trench", "coat", "大衣")) subcategories.push("overcoat");
    else if (has("shawl", "披肩")) subcategories.push("shawl");
    else subcategories.push(fit === "fitted" ? "fitted_top" : "loose_top");
  } else if (has("yoga", "volleyball", "sports", "运动", "瑜伽", "排球")) {
    mainCategory = "sports_wear";
    subcategories.push(has("volleyball", "排球") ? "volleyball_uniform" : "yoga_wear");
  } else if (has("cape", "raincoat", "costume", "pajamas", "sleepwear", "斗篷", "雨衣", "睡衣")) {
    mainCategory = "functional_wear";
    if (has("cape", "斗篷")) subcategories.push("cape");
    else if (has("raincoat", "雨衣")) subcategories.push("raincoat");
    else if (has("pajamas", "sleepwear", "睡衣")) subcategories.push("pajamas");
    else subcategories.push("costume");
  } else if (has("upper garment", "top", "shirt", "blouse", "tee", "t-shirt", "tank", "sleeveless", "上衣", "背心")) {
    mainCategory = "single_piece_top";
    subcategories.push(fit === "loose" ? "single_loose_top" : "single_fitted_top");
    if (fit === "fitted") subcategories.push("fitted_top");
  }

  const normalizedSubcategories = normalizeCategoryCodes(subcategories);
  return {
    mainCategory: mainCategory || deriveMainCategory(normalizedSubcategories[0]) || null,
    subcategories: normalizedSubcategories,
    slot: inferSlot(mainCategory, normalizedSubcategories),
    fit,
    confidence: normalizedSubcategories.length ? 0.74 : 0.45,
  };
}

export function fallbackTryOnReferenceScenes(): TryOnReferenceScene[] {
  return PRESET_REFERENCES.map((reference, index) => {
    const config = FALLBACK_REFERENCE_METADATA[reference.id] || {};
    return {
      id: reference.id,
      sceneKey: `preset_${reference.id}`,
      externalSceneId: reference.id,
      name: reference.label,
      imageUrl: reference.url,
      status: "active",
      priority: 10,
      sortOrder: index + 1,
      clothCategories: config.clothCategories || [],
      gender: config.gender || "women",
      ageRanges: ["adult"],
      viewTags: config.viewTags || ["whole_body"],
      cropTags: config.cropTags || ["full_body"],
      sceneTags: config.sceneTags || [reference.category],
      styleTags: config.styleTags || [],
      lens: config.lens || null,
      posture: config.posture || null,
      promptTags: [],
      rawConfig: { source: "preset_reference", presetId: reference.id },
    };
  });
}

export function normalizeTryOnReferenceScene(row: unknown): TryOnReferenceScene | null {
  const record = toRecord(row);
  const sceneKey = readString(record, "sceneKey") || readString(record, "scene_key") || readString(record, "id");
  const name = readString(record, "name") || readString(record, "label") || "系统参考图";
  const imageUrl = readString(record, "imageUrl") || readString(record, "image_url") || readString(record, "url");
  if (!sceneKey || !imageUrl) return null;

  return {
    id: readString(record, "id") || undefined,
    sceneKey,
    externalSceneId: readString(record, "externalSceneId") || readString(record, "external_scene_id") || null,
    name,
    imageUrl,
    status: normalizeStatus(readString(record, "status")),
    priority: normalizeNumber(record.priority, 0),
    sortOrder: normalizeNumber(record.sortOrder ?? record.sort_order, 0),
    clothCategories: normalizeCategoryCodes(readStringArray(record, "clothCategories", "cloth_categories")),
    gender: normalizeSceneGender(readString(record, "gender")),
    ageRanges: normalizeAgeRanges(readStringArray(record, "ageRanges", "age_ranges")),
    viewTags: normalizeTagArray(readStringArray(record, "viewTags", "view_tags")),
    cropTags: normalizeTagArray(readStringArray(record, "cropTags", "crop_tags")),
    sceneTags: normalizeTagArray(readStringArray(record, "sceneTags", "scene_tags")),
    styleTags: normalizeTagArray(readStringArray(record, "styleTags", "style_tags", "tags")),
    lens: readString(record, "lens") || null,
    posture: readString(record, "posture") || null,
    promptTags: normalizeTagArray(readStringArray(record, "promptTags", "prompt_tags")),
    rawConfig: toRecord(record.rawConfig ?? record.raw_config),
  };
}

export function recommendTryOnReferenceScenes(input: {
  scenes: TryOnReferenceScene[];
  analysis?: TryOnClothingAnalysis | null;
  garmentAudience?: TryOnGarmentAudience | "unisex" | null;
  ageGroup?: TryOnAgeGroup | "all" | null;
  limit?: number;
}) {
  const analysis = input.analysis ? normalizeTryOnClothingAnalysis(input.analysis) : null;
  const garmentAudience = input.garmentAudience || analysis?.genderType || "women";
  const ageGroup = input.ageGroup || analysis?.ageRange || "adult";
  const intimate = isIntimateAnalysis(analysis);
  const safetyBlocked = intimate && ageGroup !== "adult";
  const activeScenes = input.scenes
    .filter((scene) => scene.status === "active" && scene.imageUrl)
    .filter((scene) => !isSceneIntimate(scene) || ageGroup === "adult")
    .filter((scene) => !safetyBlocked || !hasUnsafeIntimatePose(scene));

  const scored = activeScenes.map((scene) => scoreTryOnReferenceScene(scene, {
    analysis,
    garmentAudience,
    ageGroup,
  })).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.sortOrder - b.sortOrder;
  });

  const limit = input.limit || TRYON_REFERENCE_RECOMMENDATION_LIMIT;
  const recommended = scored.filter((scene) => scene.score > 0).slice(0, limit);
  const fallbackAll = scored.slice(0, limit);

  return {
    recommended: recommended.length ? recommended : fallbackAll.slice(0, Math.min(8, fallbackAll.length)),
    all: fallbackAll,
    safetyBlocked,
  };
}

export function scoreTryOnReferenceScene(scene: TryOnReferenceScene, input: {
  analysis?: TryOnClothingAnalysis | null;
  garmentAudience?: TryOnGarmentAudience | "unisex" | null;
  ageGroup?: TryOnAgeGroup | "all" | null;
}): TryOnReferenceRecommendation {
  const reasons: string[] = [];
  let score = Math.min(Math.max(scene.priority, 0), 50);
  const analysis = input.analysis || null;
  const categoryCodes = new Set<string>([
    ...(analysis?.subcategories || []),
    ...(analysis?.mainCategory ? [analysis.mainCategory] : []),
  ]);
  const sceneCategories = new Set(scene.clothCategories);

  for (const code of analysis?.subcategories || []) {
    if (sceneCategories.has(code)) {
      score += 80;
      reasons.push(`二级类目命中 ${code}`);
    }
  }
  if (analysis?.mainCategory && sceneCategories.has(analysis.mainCategory)) {
    score += 40;
    reasons.push(`一级类目命中 ${analysis.mainCategory}`);
  }
  for (const code of scene.clothCategories) {
    const parent = deriveMainCategory(code);
    if (parent && categoryCodes.has(parent)) {
      score += 24;
      reasons.push(`同一级类目 ${parent}`);
      break;
    }
  }

  const preferred = getPreferredReferenceTags(analysis);
  const viewHit = countOverlap(scene.viewTags, preferred.viewTags);
  const cropHit = countOverlap(scene.cropTags, preferred.cropTags);
  if (viewHit) {
    score += 14 * viewHit;
    reasons.push("镜头范围匹配");
  }
  if (cropHit) {
    score += 12 * cropHit;
    reasons.push("构图裁切匹配");
  }

  const slot = analysis?.slot || inferSlot(analysis?.mainCategory || null, analysis?.subcategories || []);
  if (slot && scene.clothCategories.some((code) => TRYON_CATEGORY_BY_CODE.get(code)?.slot === slot)) {
    score += 18;
    reasons.push(`服装槽位匹配 ${slot}`);
  }

  const gender = input.garmentAudience || analysis?.genderType || null;
  if (gender && scene.gender === gender) {
    score += 12;
    reasons.push("人群匹配");
  } else if (scene.gender === "all" || scene.gender === "unisex") {
    score += 6;
  }

  const age = input.ageGroup || analysis?.ageRange || null;
  if (age && (scene.ageRanges.includes(age) || scene.ageRanges.includes("all"))) {
    score += 10;
    reasons.push("年龄段匹配");
  }

  if (analysis?.fit === "fitted" && scene.styleTags.some((tag) => tag.includes("clean") || tag.includes("slim"))) {
    score += 6;
  }
  if (analysis?.fit === "loose" && scene.styleTags.some((tag) => tag.includes("street") || tag.includes("casual"))) {
    score += 6;
  }

  return { ...scene, score, matchReasons: reasons };
}

export function referenceSceneToSelectedReference(scene: TryOnReferenceScene) {
  return {
    id: scene.id || scene.sceneKey,
    url: scene.imageUrl,
    label: scene.name,
    category: "scene" as const,
    is_preset: true,
    user_id: null,
  };
}

export function serializeTryOnCategorySeedForDb(category: TryOnClothingCategorySeed) {
  return {
    code: category.code,
    parent_code: category.parentCode,
    level: category.level,
    name_zh: category.nameZh,
    name_en: category.nameEn,
    slot: category.slot,
    is_intimate: category.isIntimate,
    aliases: category.aliases,
    recognition_labels: category.recognitionLabels,
    default_view_tags: category.defaultViewTags,
    default_crop_tags: category.defaultCropTags,
    enabled: category.enabled,
    sort_order: category.sortOrder,
    metadata: category.metadata || {},
  };
}

export function getPreferredReferenceTags(analysis?: TryOnClothingAnalysis | null) {
  const slot = analysis?.slot || inferSlot(analysis?.mainCategory || null, analysis?.subcategories || []);
  if (slot === "upper") {
    return { viewTags: ["upper_body", "whole_body", "front_view"], cropTags: ["upper_body", "half_body", "full_body"] };
  }
  if (slot === "lower" || analysis?.mainCategory === "bottom_pants" || analysis?.mainCategory === "bottom_skirt") {
    return { viewTags: ["whole_body", "lower_body", "front_view"], cropTags: ["full_body", "lower_body"] };
  }
  if (slot === "outer") {
    return { viewTags: ["whole_body", "front_view"], cropTags: ["full_body"] };
  }
  if (slot === "intimate") {
    return { viewTags: ["whole_body", "front_view"], cropTags: ["full_body"] };
  }
  return { viewTags: ["whole_body", "front_view"], cropTags: ["full_body"] };
}

export function isIntimateAnalysis(analysis?: TryOnClothingAnalysis | null) {
  if (!analysis) return false;
  if (analysis.slot === "intimate" || analysis.mainCategory === "underwear") return true;
  return analysis.subcategories.some((code) => TRYON_CATEGORY_BY_CODE.get(code)?.isIntimate);
}

function mainCategory(
  code: string,
  nameZh: string,
  nameEn: string,
  slot: TryOnClothingSlot,
  sortOrder: number,
  children: TryOnClothingCategorySeed[],
  isIntimate = false
) {
  return [
    {
      code,
      parentCode: null,
      level: 1 as const,
      nameZh,
      nameEn,
      slot,
      isIntimate,
      aliases: [nameZh, nameEn, code],
      recognitionLabels: [nameEn.toLowerCase(), code],
      defaultViewTags: getDefaultViewTags(slot),
      defaultCropTags: getDefaultCropTags(slot),
      enabled: true,
      sortOrder,
      metadata: {},
    },
    ...children.map((child) => ({ ...child, parentCode: code })),
  ];
}

function subCategory(
  code: string,
  nameZh: string,
  nameEn: string,
  slot: TryOnClothingSlot,
  sortOrder: number,
  aliases: string[],
  recognitionLabels: string[],
  isIntimate = false
): TryOnClothingCategorySeed {
  return {
    code,
    parentCode: null,
    level: 2,
    nameZh,
    nameEn,
    slot,
    isIntimate,
    aliases: uniqueStrings([nameZh, nameEn, code, ...aliases]),
    recognitionLabels: uniqueStrings([nameEn.toLowerCase(), code, ...recognitionLabels]),
    defaultViewTags: getDefaultViewTags(slot),
    defaultCropTags: getDefaultCropTags(slot),
    enabled: true,
    sortOrder,
    metadata: {},
  };
}

function getDefaultViewTags(slot: TryOnClothingSlot) {
  if (slot === "upper") return ["upper_body", "whole_body", "front_view"];
  if (slot === "lower") return ["whole_body", "lower_body", "front_view"];
  return ["whole_body", "front_view"];
}

function getDefaultCropTags(slot: TryOnClothingSlot) {
  if (slot === "upper") return ["upper_body", "half_body"];
  if (slot === "lower") return ["full_body", "lower_body"];
  return ["full_body"];
}

function deriveMainCategory(code?: string | null) {
  if (!code) return null;
  const category = TRYON_CATEGORY_BY_CODE.get(code);
  if (!category) return null;
  return category.level === 1 ? category.code : category.parentCode;
}

function inferSlot(mainCategory: string | null, subcategories: string[]) {
  for (const code of subcategories) {
    const slot = TRYON_CATEGORY_BY_CODE.get(code)?.slot;
    if (slot) return slot;
  }
  return mainCategory ? TRYON_CATEGORY_BY_CODE.get(mainCategory)?.slot || null : null;
}

function normalizeMainCategory(value?: string | null) {
  if (!value) return null;
  const normalized = normalizeCode(value);
  const category = TRYON_CATEGORY_BY_CODE.get(normalized);
  return category?.level === 1 ? category.code : category?.parentCode || null;
}

function normalizeCategoryCodes(values: string[]) {
  return uniqueStrings(values.map(normalizeCode).filter((code) => TRYON_CATEGORY_BY_CODE.has(code)));
}

function normalizeCode(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[_-]+/g, " ");
}

function normalizeSlot(value?: string | null): TryOnClothingSlot | null {
  return value === "upper" || value === "lower" || value === "single" || value === "outer" || value === "intimate" || value === "functional"
    ? value
    : null;
}

function normalizeFit(value?: string | null): TryOnClothingAnalysis["fit"] {
  return value === "loose" || value === "fitted" || value === "regular" ? value : null;
}

function normalizeGender(value?: string | null): TryOnClothingAnalysis["genderType"] {
  if (value === "women" || value === "female") return "women";
  if (value === "men" || value === "male") return "men";
  if (value === "unisex" || value === "all") return "unisex";
  return null;
}

function normalizeSceneGender(value?: string | null): TryOnReferenceScene["gender"] {
  if (value === "women" || value === "female") return "women";
  if (value === "men" || value === "male") return "men";
  if (value === "unisex") return "unisex";
  return "all";
}

function normalizeAge(value?: string | null): TryOnClothingAnalysis["ageRange"] {
  if (value === "adult" || value === "teen" || value === "big_child" || value === "middle_child" || value === "small_child" || value === "toddler") return value;
  if (value === "all") return "all";
  return null;
}

function normalizeAgeRanges(values: string[]) {
  const normalized = values.map(normalizeAge).filter(Boolean) as Array<TryOnAgeGroup | "all">;
  return normalized.length ? Array.from(new Set(normalized)) : (["all"] as Array<TryOnAgeGroup | "all">);
}

function normalizeStatus(value?: string | null): TryOnReferenceSceneStatus {
  return value === "draft" || value === "archived" ? value : "active";
}

function normalizeTagArray(values: string[]) {
  return uniqueStrings(values.map((value) => value.trim().toLowerCase()).filter(Boolean));
}

function readString(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function readStringArray(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean);
    }
    if (typeof value === "string" && value.trim()) {
      return value.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeNumber(value: unknown, fallback: number) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function uniqueStrings<T extends string>(values: T[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function countOverlap(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item)).length;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isSceneIntimate(scene: TryOnReferenceScene) {
  return scene.clothCategories.some((code) => TRYON_CATEGORY_BY_CODE.get(code)?.isIntimate || code === "underwear")
    || scene.sceneTags.some((tag) => tag.includes("intimate") || tag.includes("lingerie"));
}

function hasUnsafeIntimatePose(scene: TryOnReferenceScene) {
  const text = normalizeText([scene.posture, ...scene.sceneTags, ...scene.styleTags, ...scene.promptTags].filter(Boolean).join(" "));
  return ["bed", "lying", "sexy", "suggestive", "revealing", "床", "躺"].some((keyword) => text.includes(keyword));
}

const FALLBACK_REFERENCE_METADATA: Record<string, Partial<TryOnReferenceScene>> = {
  r1: { clothCategories: ["single_piece_top", "single_fitted_top"], viewTags: ["whole_body", "front_view"], cropTags: ["full_body"], sceneTags: ["street"], styleTags: ["casual", "clean"] },
  r2: { clothCategories: ["dress", "single_piece_top"], viewTags: ["whole_body", "front_view"], cropTags: ["full_body"], sceneTags: ["night"], styleTags: ["elegant"] },
  r3: { clothCategories: ["outerwear", "single_piece_top"], viewTags: ["whole_body", "front_view"], cropTags: ["full_body"], sceneTags: ["street"], styleTags: ["elegant"] },
  r4: { clothCategories: ["outerwear", "single_piece_top"], viewTags: ["whole_body", "front_view"], cropTags: ["full_body"], sceneTags: ["indoor"], styleTags: ["soft"] },
  r5: { clothCategories: ["single_piece_top", "shorts"], viewTags: ["whole_body", "front_view"], cropTags: ["full_body"], sceneTags: ["street"], styleTags: ["casual"] },
  r6: { clothCategories: ["single_piece_top", "single_loose_top"], gender: "men", viewTags: ["upper_body", "front_view"], cropTags: ["upper_body"], sceneTags: ["studio"], styleTags: ["menswear"] },
  r7: { clothCategories: ["single_piece_top", "single_fitted_top", "long_pants"], viewTags: ["whole_body", "front_view"], cropTags: ["full_body"], sceneTags: ["street"], styleTags: ["casual"] },
  r8: { clothCategories: ["single_piece_top", "single_fitted_top", "bottom_skirt", "aline_skirt"], viewTags: ["whole_body", "front_view"], cropTags: ["full_body"], sceneTags: ["studio"], styleTags: ["clean", "slim"] },
  r9: { clothCategories: ["bottom_pants", "long_pants", "outerwear"], viewTags: ["whole_body", "front_view"], cropTags: ["full_body"], sceneTags: ["cafe"], styleTags: ["casual", "street"] },
  r10: { clothCategories: ["single_piece_top", "shorts"], viewTags: ["whole_body", "front_view"], cropTags: ["full_body"], sceneTags: ["studio"], styleTags: ["clean"] },
};
