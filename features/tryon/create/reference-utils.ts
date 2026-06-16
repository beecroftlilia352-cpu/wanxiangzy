import type { TryOnSceneMode } from "@/lib/tryon-scene";
import { PRESET_MODELS, PRESET_REFERENCES } from "@/lib/tryon-studio-options";
import { MAX_TRYON_OUTPUT_IMAGES } from "./constants";
import { sameAssetUrl, uniqueReferenceImages } from "./asset-utils";
import type {
  FavoriteReference,
  ReferenceSource,
  ReferenceTemplate,
  SelectedReferenceImage,
  TryOnHistoryPayload,
} from "./types";

export function findPresetModelByUrl(url?: string | null) {
  return PRESET_MODELS.find((model) => sameAssetUrl(model.image_url, url));
}

export function findPresetReferenceByUrl(url?: string | null) {
  return PRESET_REFERENCES.find((reference) => sameAssetUrl(reference.url, url));
}

export function toPresetReference(ref: typeof PRESET_REFERENCES[number]): SelectedReferenceImage {
  return { ...ref, is_preset: true, user_id: null, source: "preset" } as SelectedReferenceImage;
}

export function toFavoriteReference(ref: FavoriteReference): SelectedReferenceImage {
  return { ...ref, source: "favorite" };
}

export function normalizeReferenceCategoryValue(value: unknown): FavoriteReference["category"] {
  return value === "style" || value === "pose" || value === "scene" ? value : "scene";
}

export function normalizeFavoriteReference(value: unknown): FavoriteReference | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.url !== "string") return null;
  return {
    id: record.id,
    url: record.url,
    label: typeof record.label === "string" && record.label.trim() ? record.label : "收藏参考图",
    category: normalizeReferenceCategoryValue(record.category),
    is_preset: false,
    user_id: null,
  };
}

export function normalizeReferenceTemplate(value: unknown): ReferenceTemplate | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string") return null;
  const references = Array.isArray(record.references)
    ? uniqueReferenceImages(record.references.map((item, index) => {
      if (!item || typeof item !== "object") return null;
      const ref = item as Record<string, unknown>;
      if (typeof ref.url !== "string" || !ref.url.trim()) return null;
      return {
        id: typeof ref.id === "string" && ref.id.trim() ? ref.id : `template-${record.id}-${index}`,
        url: ref.url.trim(),
        label: typeof ref.label === "string" && ref.label.trim() ? ref.label : `参考图${index + 1}`,
        category: normalizeReferenceCategoryValue(ref.category),
        is_preset: ref.source === "preset",
        user_id: null,
        source: "template",
      } as SelectedReferenceImage;
    }).filter(Boolean) as SelectedReferenceImage[])
    : [];
  if (!references.length) return null;
  return {
    id: record.id,
    name: typeof record.name === "string" && record.name.trim() ? record.name : `参考模板 ${references.length} 张`,
    coverUrl: typeof record.coverUrl === "string" && record.coverUrl ? record.coverUrl : references[0].url,
    references,
  };
}

export function getFallbackSystemReferences() {
  return PRESET_REFERENCES.map(toPresetReference);
}

export function getReferenceSceneMode(ref: SelectedReferenceImage): TryOnSceneMode {
  if (ref.source === "favorite" || ref.source === "template") return "favorites";
  if (ref.source === "upload" || ref.source === "history") return "upload_reference";
  return "system_reference";
}

export function referenceBelongsToSceneMode(ref: SelectedReferenceImage, mode: TryOnSceneMode) {
  if (mode === "auto_design") return false;
  return getReferenceSceneMode(ref) === mode;
}

export function coerceVisibleSceneMode(mode: TryOnSceneMode | undefined): TryOnSceneMode {
  if (mode && mode !== "system_reference") return mode;
  return "upload_reference";
}

export function getSceneChildReferences(scene: SelectedReferenceImage | null) {
  if (!scene) return [];
  return uniqueReferenceImages((scene.childReferences?.length ? scene.childReferences : [scene]) as SelectedReferenceImage[]);
}

export function referenceMatchesSceneFilters(ref: SelectedReferenceImage, filters: {
  view: "all" | "front" | "back";
  body: "all" | "whole" | "upper" | "lower";
  search: string;
}) {
  const haystack = [
    ref.label,
    ...(ref.viewTags || []),
    ...(ref.cropTags || []),
    ...(ref.sceneTags || []),
    ...(ref.styleTags || []),
    ...(ref.clothCategories || []),
  ].join(" ").toLowerCase();
  const search = filters.search.trim().toLowerCase();
  if (search && !haystack.includes(search)) return false;
  if (filters.view === "front" && !haystack.includes("front") && !haystack.includes("正面")) return false;
  if (filters.view === "back" && !haystack.includes("back") && !haystack.includes("背面")) return false;
  if (filters.body === "whole" && !haystack.includes("whole") && !haystack.includes("full") && !haystack.includes("全身")) return false;
  if (filters.body === "upper" && !haystack.includes("upper") && !haystack.includes("half") && !haystack.includes("上半身")) return false;
  if (filters.body === "lower" && !haystack.includes("lower") && !haystack.includes("下半身")) return false;
  return true;
}

export function toHistoryReference(url: string, index = 0, source: ReferenceSource = "history"): SelectedReferenceImage {
  const preset = findPresetReferenceByUrl(url);
  if (preset) return { ...toPresetReference(preset), source };
  return {
    id: `history-reference-${index + 1}`,
    url,
    label: index > 0 ? `历史参考 ${index + 1}` : "历史参考",
    category: "style",
    is_preset: false,
    user_id: null,
    source,
  };
}

export function getHistoryReferenceSource(sceneMode: TryOnSceneMode): ReferenceSource {
  if (sceneMode === "favorites") return "favorite";
  return "history";
}

export function getHistoryReferenceUrls(payload: TryOnHistoryPayload) {
  return uniqueReferenceImages([
    ...((Array.isArray(payload.referenceUrls) ? payload.referenceUrls : [])
      .map((url, index) => typeof url === "string" && url.trim() ? toHistoryReference(url.trim(), index) : null)
      .filter(Boolean) as SelectedReferenceImage[]),
    ...(payload.referenceUrl ? [toHistoryReference(payload.referenceUrl)] : []),
  ]).map((item) => item.url);
}

export function getTryOnHistoryExpectedCount(payload: TryOnHistoryPayload) {
  const referenceCount = payload.sceneMode === "auto_design" ? 1 : getHistoryReferenceUrls(payload).length || 1;
  return Math.min(MAX_TRYON_OUTPUT_IMAGES, Math.max(1, payload.genCount * referenceCount));
}
