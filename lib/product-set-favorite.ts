import {
  getSupportedImageSizes,
  normalizeAspectRatio,
  normalizeImageSize,
  normalizeLingyaModel,
  type AspectRatio,
  type ImageSize,
  type LingyaModel,
} from "@/lib/api/lingya";
import {
  normalizeProductSetCreationMode,
  normalizeProductSetImageType,
  normalizeProductSetModuleOverrides,
  normalizeProductSetSettings,
  type ProductSetCreationMode,
  type ProductSetCustomTemplate,
  type ProductSetImageType,
  type ProductSetModuleOverride,
  type ProductSetResolvedTemplate,
  type ProductSetSettings,
} from "@/lib/product-set";

export const FAVORITE_PLAN_LIMIT = 24;
export const FAVORITE_PLAN_COLUMNS = [
  "id",
  "name",
  "mode",
  "image_type",
  "gen_count",
  "settings",
  "selected_template_ids",
  "custom_templates",
  "module_overrides",
  "ai_model",
  "aspect_ratio",
  "image_size",
  "quality_mode",
  "plan_preview",
  "created_at",
  "updated_at",
].join(",");

const MAX_NAME_LENGTH = 40;
const MAX_TEMPLATE_COUNT = 10;
const MAX_OVERRIDE_COUNT = 10;
const MAX_PREVIEW_COUNT = 12;
const MAX_REFERENCE_URLS = 8;
const TEXT_CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

export type FavoritePlanModule = {
  name: string;
  moduleRole: string;
  aspectRatio: AspectRatio;
  source: ProductSetResolvedTemplate["source"];
  usesModel: boolean;
};

export type FavoritePlanRow = {
  id: string;
  name: string;
  mode: ProductSetCreationMode;
  image_type: ProductSetImageType;
  gen_count: number;
  settings: ProductSetSettings;
  selected_template_ids: number[];
  custom_templates: ProductSetCustomTemplate[];
  module_overrides: ProductSetModuleOverride[];
  ai_model: LingyaModel;
  aspect_ratio: AspectRatio;
  image_size: ImageSize;
  quality_mode: "standard" | "advanced";
  plan_preview: FavoritePlanModule[];
  created_at: string;
  updated_at: string;
};

export type FavoritePlanPayload = Omit<FavoritePlanRow, "id" | "created_at" | "updated_at"> & {
  updated_at: string;
};

export type FavoritePlanClient = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  mode: ProductSetCreationMode;
  imageType: ProductSetImageType;
  genCount: number;
  settings: ProductSetSettings;
  selectedTemplateIds: number[];
  customTemplates: ProductSetCustomTemplate[];
  moduleOverrides: ProductSetModuleOverride[];
  aiModel: LingyaModel;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  qualityMode: "standard" | "advanced";
  planPreview: FavoritePlanModule[];
};

export function normalizeFavoritePlanPayload(value: unknown): FavoritePlanPayload | null {
  if (!isPlainObject(value)) return null;

  const name = cleanText(value.name, MAX_NAME_LENGTH);
  if (!name) return null;

  const imageType = normalizeProductSetImageType(value.imageType);
  const mode = normalizeProductSetCreationMode(value.mode);
  const aiModel = normalizeLingyaModel(value.aiModel);
  const fallbackAspectRatio = imageType === "details" ? "3:4" : "1:1";
  const aspectRatio = normalizeAspectRatio(value.aspectRatio || fallbackAspectRatio, fallbackAspectRatio);
  const imageSize = normalizeImageSize(
    aiModel,
    cleanText(value.imageSize, 8, "1K") as ImageSize,
    aspectRatio
  );

  return {
    name,
    mode,
    image_type: imageType,
    gen_count: clampPlanCount(value.genCount, imageType),
    settings: normalizeProductSetSettings(value.settings),
    selected_template_ids: normalizeTemplateIds(value.selectedTemplateIds),
    custom_templates: normalizeCustomTemplates(value.customTemplates),
    module_overrides: normalizeProductSetModuleOverrides(value.moduleOverrides).slice(0, MAX_OVERRIDE_COUNT),
    ai_model: aiModel,
    aspect_ratio: aspectRatio,
    image_size: getSupportedImageSizes(aiModel, aspectRatio).includes(imageSize) ? imageSize : "1K",
    quality_mode: value.qualityMode === "advanced" ? "advanced" : "standard",
    plan_preview: normalizePlanPreview(value.planPreview),
    updated_at: new Date().toISOString(),
  };
}

export function favoritePlanRowToClient(value: unknown): FavoritePlanClient {
  const row = isPlainObject(value) ? value : {};
  const imageType = normalizeProductSetImageType(row.image_type);
  const mode = normalizeProductSetCreationMode(row.mode);
  const aiModel = normalizeLingyaModel(row.ai_model);
  const fallbackAspectRatio = imageType === "details" ? "3:4" : "1:1";
  const aspectRatio = normalizeAspectRatio(row.aspect_ratio || fallbackAspectRatio, fallbackAspectRatio);
  const imageSize = normalizeImageSize(aiModel, cleanText(row.image_size, 8, "1K") as ImageSize, aspectRatio);
  const updatedAt = cleanText(row.updated_at, 40, new Date(0).toISOString());

  return {
    id: cleanText(row.id, 80),
    name: cleanText(row.name, MAX_NAME_LENGTH, imageType === "details" ? "AI detail plan" : "AI main plan"),
    createdAt: cleanText(row.created_at, 40, updatedAt),
    updatedAt,
    mode,
    imageType,
    genCount: clampPlanCount(row.gen_count, imageType),
    settings: normalizeProductSetSettings(row.settings),
    selectedTemplateIds: normalizeTemplateIds(row.selected_template_ids),
    customTemplates: normalizeCustomTemplates(row.custom_templates),
    moduleOverrides: normalizeProductSetModuleOverrides(row.module_overrides).slice(0, MAX_OVERRIDE_COUNT),
    aiModel,
    aspectRatio,
    imageSize,
    qualityMode: row.quality_mode === "advanced" ? "advanced" : "standard",
    planPreview: normalizePlanPreview(row.plan_preview),
  };
}

function normalizeCustomTemplates(value: unknown): ProductSetCustomTemplate[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): ProductSetCustomTemplate | null => {
      if (!isPlainObject(item)) return null;
      const id = cleanText(item.id, 80);
      const name = cleanText(item.name, MAX_NAME_LENGTH);
      const typeDescription = cleanText(item.typeDescription, 1200);
      const imageType = normalizeProductSetImageType(item.imageType);
      if (!id || !name || !typeDescription) return null;

      return {
        id,
        name,
        imageType,
        typeDescription,
        aspectRatio: normalizeAspectRatio(item.aspectRatio, imageType === "details" ? "3:4" : "1:1"),
        referenceImageUrls: normalizeUrlList(item.referenceImageUrls),
        modelReferenceImageUrls: normalizeUrlList(item.modelReferenceImageUrls),
        otherReferenceImageUrls: normalizeUrlList(item.otherReferenceImageUrls),
        extraDescription: cleanOptionalText(item.extraDescription, 1200),
        subjectConsistency: item.subjectConsistency === true,
        modelConsistency: item.modelConsistency === true,
        intelligentCopy: item.intelligentCopy === true,
        copyDensity: normalizeCopyDensity(item.copyDensity),
        moduleRole: cleanOptionalText(item.moduleRole, 180),
        contentScope: cleanOptionalText(item.contentScope, 420),
        layoutRules: cleanOptionalText(item.layoutRules, 420),
        textRules: cleanOptionalText(item.textRules, 320),
        avoidRules: cleanOptionalText(item.avoidRules, 420),
      };
    })
    .filter((item): item is ProductSetCustomTemplate => Boolean(item))
    .slice(0, MAX_TEMPLATE_COUNT);
}

function normalizePlanPreview(value: unknown): FavoritePlanModule[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): FavoritePlanModule | null => {
      if (!isPlainObject(item)) return null;
      const name = cleanText(item.name, MAX_NAME_LENGTH);
      if (!name || !isTemplateSource(item.source)) return null;
      return {
        name,
        moduleRole: cleanText(item.moduleRole, 160),
        aspectRatio: normalizeAspectRatio(item.aspectRatio, "3:4"),
        source: item.source,
        usesModel: item.usesModel === true,
      };
    })
    .filter((item): item is FavoritePlanModule => Boolean(item))
    .slice(0, MAX_PREVIEW_COUNT);
}

function normalizeTemplateIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item > 0 && item <= 100_000)
  )).slice(0, MAX_TEMPLATE_COUNT);
}

function normalizeUrlList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanText(item, 2048))
    .filter((item) => item.startsWith("http://") || item.startsWith("https://") || item.startsWith("data:image/"))
    .slice(0, MAX_REFERENCE_URLS);
}

function clampPlanCount(value: unknown, imageType: ProductSetImageType) {
  const number = Number(value);
  const raw = Number.isFinite(number) ? number : imageType === "details" ? 5 : 3;
  return Math.min(Math.max(Math.round(raw), 1), imageType === "details" ? 8 : 6);
}

function cleanText(value: unknown, maxLength: number, fallback = "") {
  if (typeof value !== "string") return fallback;
  const normalized = value.replace(TEXT_CONTROL_CHARS, " ").replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, maxLength) : fallback;
}

function cleanOptionalText(value: unknown, maxLength: number) {
  const text = cleanText(value, maxLength);
  return text || undefined;
}

function normalizeCopyDensity(value: unknown) {
  return value === "none" || value === "light" || value === "standard" || value === "rich"
    ? value
    : undefined;
}

function isTemplateSource(value: unknown): value is ProductSetResolvedTemplate["source"] {
  return value === "preset" || value === "ai" || value === "custom";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
