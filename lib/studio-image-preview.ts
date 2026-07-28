import type { TaskStatusGroup } from "@/lib/task-queue";

export type ImagePreviewModule =
  | "tryon"
  | "model"
  | "faceSwap"
  | "grass"
  | "productSet"
  | "productRetouch"
  | "allCategoryProductImage"
  | "outfitFusion"
  | "modelBackground"
  | "materialEnhancement"
  | "pose"
  | "garment3d"
  | "generalImage";

export type ImagePreviewReferenceRole =
  | "clothing"
  | "model"
  | "reference"
  | "source"
  | "face"
  | "product"
  | "style"
  | "background"
  | "garment"
  | "input";

export type ImagePreviewReference = {
  url: string;
  label: string;
  role?: ImagePreviewReferenceRole;
};

export type ImagePreviewMetaItem = {
  label: string;
  value: string | number | null | undefined;
};

export type ImagePreviewResultStatus = "completed" | "running" | "queued" | "failed";

export type ImagePreviewQuality = {
  label?: string;
  score?: number;
  summary?: string;
  issues?: string[];
};

export type ImagePreviewResult = {
  url?: string | null;
  title: string;
  badgeLabel?: string;
  subtitle?: string;
  status?: ImagePreviewResultStatus;
  aspectRatio?: string;
  quality?: ImagePreviewQuality;
  error?: string | null;
};

export type ImagePreviewActionKind =
  | "download"
  | "copy"
  | "repair"
  | "aiVideo"
  | "modelBackground"
  | "pose"
  | "productSet"
  | "allCategoryProductImage"
  | "regenerateOne"
  | "regenerateAll"
  | "feedback"
  | "useAsSource"
  | "useAsFace";

export type ImagePreviewAction = {
  kind: ImagePreviewActionKind;
  label: string;
  disabled?: boolean;
  disabledReason?: string;
};

export type ImagePreviewSession = {
  module: ImagePreviewModule;
  title: string;
  taskId?: string | null;
  createdAt?: string | null;
  statusGroup?: TaskStatusGroup;
  metaItems?: ImagePreviewMetaItem[];
  references?: ImagePreviewReference[];
  promptText?: string | null;
  results: ImagePreviewResult[];
  selectedIndex?: number;
};

export const SOURCE_IMAGE_PARAM = "sourceImage";

export const IMAGE_PREVIEW_MODULE_LABELS: Record<ImagePreviewModule, string> = {
  tryon: "服装上身",
  model: "专属模特",
  faceSwap: "AI换脸",
  grass: "种草图",
  productSet: "商品套图",
  productRetouch: "商品精修",
  allCategoryProductImage: "全品类商品图",
  outfitFusion: "搭配融图",
  modelBackground: "模特换背景",
  materialEnhancement: "材质增强",
  pose: "姿势裂变",
  garment3d: "服装 3D",
  generalImage: "通用生图",
};

export function createImagePreviewSession(input: ImagePreviewSession): ImagePreviewSession {
  const results = input.results.length
    ? input.results.map(normalizePreviewResult)
    : [normalizePreviewResult({ title: "等待结果", status: input.statusGroup === "failed" ? "failed" : "queued" })];
  return {
    ...input,
    title: input.title || IMAGE_PREVIEW_MODULE_LABELS[input.module],
    metaItems: compactMetaItems(input.metaItems),
    references: uniquePreviewReferences(input.references || []),
    promptText: normalizePromptText(input.promptText),
    results,
    selectedIndex: clampIndex(input.selectedIndex, results.length),
  };
}

export function getPreviewCanvasInputReferences(
  session: Pick<ImagePreviewSession, "module" | "references">
): ImagePreviewReference[] {
  const references = session.references || [];
  if (!references.length) return [];

  if (session.module === "model" || session.module === "outfitFusion") {
    return references;
  }

  if (session.module !== "tryon") {
    return [references[0]];
  }

  const clothingReferences = references.filter((reference) => {
    if (reference.role === "clothing" || reference.role === "garment" || reference.role === "product") return true;
    return /上装|下装|服装|连体|商品/.test(reference.label);
  });
  return clothingReferences.length ? clothingReferences : [references[0]];
}

export function buildImagePreviewResults(input: {
  urls?: Array<string | null | undefined>;
  expectedCount?: number;
  isGenerating?: boolean;
  statusGroup?: TaskStatusGroup;
  titlePrefix?: string;
  subtitles?: Array<string | null | undefined>;
  aspectRatio?: string;
  errors?: Array<string | null | undefined>;
  qualities?: Array<ImagePreviewQuality | null | undefined>;
}): ImagePreviewResult[] {
  const urls = (input.urls || []).map((url) => typeof url === "string" && url.trim().length > 0 ? url.trim() : null);
  const completedCount = urls.filter(Boolean).length;
  const expectedCount = Math.max(1, Math.round(Number(input.expectedCount) || urls.length || completedCount || 1));
  const count = Math.max(expectedCount, urls.length, completedCount, 1);
  const running = isPreviewSessionRunning(input.statusGroup, input.isGenerating, completedCount >= count);
  const failed = input.statusGroup === "failed";
  const completed = input.statusGroup === "completed";
  const titlePrefix = input.titlePrefix || "结果";

  return Array.from({ length: count }, (_, index) => {
    const url = urls[index] || null;
    const error = input.errors?.[index] || null;
    const status: ImagePreviewResultStatus = url
      ? "completed"
      : failed || completed || error
        ? "failed"
        : running
          ? "running"
          : "queued";
    return normalizePreviewResult({
      url,
      title: count > 1 ? `${titlePrefix} ${index + 1}` : titlePrefix,
      subtitle: input.subtitles?.[index] || undefined,
      status,
      aspectRatio: input.aspectRatio,
      quality: input.qualities?.[index] || undefined,
      error,
    });
  });
}

export function createGenericImagePreviewSession(input: {
  module: ImagePreviewModule;
  title?: string;
  urls: string[];
  filenamePrefix?: string;
  expectedCount?: number;
  isGenerating?: boolean;
  statusGroup?: TaskStatusGroup;
  taskId?: string | null;
  createdAt?: string | null;
  references?: ImagePreviewReference[];
  inputThumbnails?: string[];
  promptText?: string | null;
  metaItems?: ImagePreviewMetaItem[];
  selectedIndex?: number;
  resultTitlePrefix?: string;
  aspectRatio?: string;
  errors?: Array<string | null | undefined>;
  qualities?: Array<ImagePreviewQuality | null | undefined>;
}): ImagePreviewSession {
  return createImagePreviewSession({
    module: input.module,
    title: input.title || IMAGE_PREVIEW_MODULE_LABELS[input.module],
    taskId: input.taskId,
    createdAt: input.createdAt,
    statusGroup: input.statusGroup,
    metaItems: input.metaItems,
    references: input.references?.length ? input.references : referencesFromUrls(input.inputThumbnails || []),
    promptText: input.promptText,
    selectedIndex: input.selectedIndex,
    results: buildImagePreviewResults({
      urls: input.urls,
      expectedCount: input.expectedCount,
      isGenerating: input.isGenerating,
      statusGroup: input.statusGroup,
      titlePrefix: input.resultTitlePrefix || IMAGE_PREVIEW_MODULE_LABELS[input.module],
      aspectRatio: input.aspectRatio,
      errors: input.errors,
      qualities: input.qualities,
    }),
  });
}

export function createTryOnPreviewSession(input: {
  urls: string[];
  expectedCount?: number;
  isGenerating?: boolean;
  statusGroup?: TaskStatusGroup;
  taskId?: string | null;
  createdAt?: string | null;
  clothingUrls?: string[];
  modelFaceUrl?: string | null;
  referenceUrls?: string[];
  promptText?: string | null;
  metaItems?: ImagePreviewMetaItem[];
  selectedIndex?: number;
}): ImagePreviewSession {
  const references: ImagePreviewReference[] = [
    ...(input.clothingUrls || []).map((url, index) => ({
      url,
      label: (input.clothingUrls?.length || 0) > 1 ? `服装 ${index + 1}` : "服装",
      role: "clothing" as const,
    })),
    ...(input.referenceUrls || []).map((url, index) => ({
      url,
      label: (input.referenceUrls?.length || 0) > 1 ? `参考图 ${index + 1}` : "参考图",
      role: "reference" as const,
    })),
    ...(input.modelFaceUrl ? [{ url: input.modelFaceUrl, label: "模特", role: "model" as const }] : []),
  ];
  return createGenericImagePreviewSession({
    module: "tryon",
    urls: input.urls,
    expectedCount: input.expectedCount,
    isGenerating: input.isGenerating,
    statusGroup: input.statusGroup,
    taskId: input.taskId,
    createdAt: input.createdAt,
    references,
    promptText: input.promptText,
    metaItems: input.metaItems,
    selectedIndex: input.selectedIndex,
    resultTitlePrefix: "服装上身结果",
  });
}

export function createFaceSwapPreviewSession(input: {
  urls: string[];
  expectedCount?: number;
  isGenerating?: boolean;
  statusGroup?: TaskStatusGroup;
  taskId?: string | null;
  createdAt?: string | null;
  sourceUrl?: string | null;
  faceUrl?: string | null;
  promptText?: string | null;
  metaItems?: ImagePreviewMetaItem[];
  selectedIndex?: number;
}): ImagePreviewSession {
  const references: ImagePreviewReference[] = [
    ...(input.sourceUrl ? [{ url: input.sourceUrl, label: "原始图", role: "source" as const }] : []),
    ...(input.faceUrl ? [{ url: input.faceUrl, label: "目标脸图", role: "face" as const }] : []),
  ];
  return createGenericImagePreviewSession({
    module: "faceSwap",
    urls: input.urls,
    expectedCount: input.expectedCount,
    isGenerating: input.isGenerating,
    statusGroup: input.statusGroup,
    taskId: input.taskId,
    createdAt: input.createdAt,
    references,
    promptText: input.promptText,
    metaItems: input.metaItems,
    selectedIndex: input.selectedIndex,
    resultTitlePrefix: "换脸结果",
  });
}

export function createProductSetPreviewSession(input: {
  module?: "productSet" | "allCategoryProductImage";
  urls: string[];
  expectedCount?: number;
  isGenerating?: boolean;
  statusGroup?: TaskStatusGroup;
  taskId?: string | null;
  createdAt?: string | null;
  references?: ImagePreviewReference[];
  inputThumbnails?: string[];
  promptText?: string | null;
  metaItems?: ImagePreviewMetaItem[];
  selectedIndex?: number;
  titles?: string[];
  subtitles?: string[];
  statuses?: ImagePreviewResultStatus[];
  errors?: Array<string | null | undefined>;
  qualities?: Array<ImagePreviewQuality | null | undefined>;
}): ImagePreviewSession {
  const module = input.module || "productSet";
  const urls = input.urls || [];
  const completedCount = urls.filter(Boolean).length;
  const expectedCount = Math.max(1, input.expectedCount || input.titles?.length || urls.length || completedCount || 1);
  const running = isPreviewSessionRunning(input.statusGroup, input.isGenerating, completedCount >= expectedCount);
  return createImagePreviewSession({
    module,
    title: IMAGE_PREVIEW_MODULE_LABELS[module],
    taskId: input.taskId,
    createdAt: input.createdAt,
    statusGroup: input.statusGroup,
    references: input.references?.length ? input.references : referencesFromUrls(input.inputThumbnails || [], "product"),
    promptText: input.promptText,
    metaItems: input.metaItems,
    selectedIndex: input.selectedIndex,
    results: Array.from({ length: expectedCount }, (_, index) => {
      const url = typeof urls[index] === "string" && urls[index].trim() ? urls[index].trim() : null;
      const error = input.errors?.[index] || null;
      return normalizePreviewResult({
        url,
        title: input.titles?.[index] || `${IMAGE_PREVIEW_MODULE_LABELS[module]} ${index + 1}`,
        subtitle: input.subtitles?.[index],
        status: input.statuses?.[index] || (url
          ? "completed"
          : error || input.statusGroup === "failed" || input.statusGroup === "completed"
            ? "failed"
            : running
              ? "running"
              : "queued"),
        error,
        quality: input.qualities?.[index] || undefined,
      });
    }),
  });
}

export function referencesFromUrls(
  urls: Array<string | null | undefined>,
  role: ImagePreviewReferenceRole = "input",
  labelPrefix = "输入"
): ImagePreviewReference[] {
  return urls
    .filter((url): url is string => typeof url === "string" && url.trim().length > 0)
    .map((url, index) => ({
      url,
      label: `${labelPrefix} ${index + 1}`,
      role,
    }));
}

export function compactMetaItems(items?: ImagePreviewMetaItem[]): ImagePreviewMetaItem[] {
  return (items || [])
    .map((item) => ({
      label: item.label,
      value: typeof item.value === "string" ? item.value.trim() : item.value,
    }))
    .filter((item) => Boolean(item.label && item.value !== null && item.value !== undefined && String(item.value).trim().length > 0));
}

export function uniquePreviewReferences(items: ImagePreviewReference[]): ImagePreviewReference[] {
  const seen = new Set<string>();
  const result: ImagePreviewReference[] = [];
  for (const item of items) {
    if (!item.url || seen.has(item.url)) continue;
    seen.add(item.url);
    result.push({
      ...item,
      label: item.label || "输入图",
    });
  }
  return result;
}

export function getSelectedPreviewResult(session: ImagePreviewSession): ImagePreviewResult {
  return session.results[clampIndex(session.selectedIndex, session.results.length)] || session.results[0];
}

export function isValidSourceImageUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function readSourceImageFromUrl(urlLike: string | URL): string | null {
  try {
    const url = typeof urlLike === "string" ? new URL(urlLike, "http://localhost") : urlLike;
    const value = url.searchParams.get(SOURCE_IMAGE_PARAM);
    return isValidSourceImageUrl(value) ? value : null;
  } catch {
    return null;
  }
}

export function clearSourceImageParamFromUrl(urlLike: string | URL): string {
  const url = typeof urlLike === "string" ? new URL(urlLike, "http://localhost") : new URL(urlLike.toString());
  url.searchParams.delete(SOURCE_IMAGE_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function buildSourceImageHref(path: string, imageUrl: string, extraParams?: Record<string, string | number | boolean | null | undefined>) {
  const url = new URL(path, "http://localhost");
  url.searchParams.set(SOURCE_IMAGE_PARAM, imageUrl);
  Object.entries(extraParams || {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") return;
    url.searchParams.set(key, String(value));
  });
  return `${url.pathname}${url.search}${url.hash}`;
}

export function takeSourceImageFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  const value = readSourceImageFromUrl(window.location.href);
  if (value) {
    window.history.replaceState(window.history.state, "", clearSourceImageParamFromUrl(window.location.href));
  }
  return value;
}

function normalizePreviewResult(result: ImagePreviewResult): ImagePreviewResult {
  return {
    ...result,
    title: result.title || "结果",
    status: result.status || (result.url ? "completed" : "queued"),
    url: typeof result.url === "string" && result.url.trim() ? result.url.trim() : null,
    error: typeof result.error === "string" && result.error.trim() ? result.error.trim() : null,
    quality: result.quality
      ? {
          ...result.quality,
          issues: (result.quality.issues || []).filter(Boolean),
        }
      : undefined,
  };
}

function isPreviewSessionRunning(statusGroup: TaskStatusGroup | undefined, isGenerating: boolean | undefined, allExpectedResultsReady: boolean) {
  if (allExpectedResultsReady || statusGroup === "completed" || statusGroup === "failed") return false;
  if (statusGroup === "running" || statusGroup === "queued") return true;
  return Boolean(isGenerating);
}

function normalizePromptText(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function clampIndex(index: number | undefined, length: number) {
  if (!length) return 0;
  const normalized = Math.round(Number(index) || 0);
  return Math.min(Math.max(normalized, 0), length - 1);
}
