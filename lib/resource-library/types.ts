export const RESOURCE_LIBRARY_ASSET_SOURCES = ["upload", "generation"] as const;
export const RESOURCE_LIBRARY_MEDIA_TYPES = ["image", "video"] as const;
export const RESOURCE_LIBRARY_VIEWS = ["single", "group", "video"] as const;

export type ResourceLibraryAssetSource = typeof RESOURCE_LIBRARY_ASSET_SOURCES[number];
export type ResourceLibraryMediaType = typeof RESOURCE_LIBRARY_MEDIA_TYPES[number];
export type ResourceLibraryView = typeof RESOURCE_LIBRARY_VIEWS[number];

export type ResourceLibraryAsset = {
  id: string;
  url: string;
  previewUrl: string | null;
  /** Optional compatibility alias for callers that distinguish card thumbnails. */
  thumbnailUrl?: string | null;
  sourceType: ResourceLibraryAssetSource;
  mediaType: ResourceLibraryMediaType;
  moduleKey: string | null;
  sourceGenerationId: string | null;
  sourceResultIndex: number | null;
  groupKey: string | null;
  groupTotal: number;
  title: string;
  originalFilename: string | null;
  mimeType: string | null;
  byteSize: number | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  metadata: Record<string, unknown>;
  savedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type ResourceLibraryAssetListResponse = {
  items: ResourceLibraryAsset[];
  hasMore: boolean;
  nextCursor: string | null;
};

export type ResourceLibraryFacet = {
  sourceType: ResourceLibraryAssetSource;
  moduleKey: string | null;
  mediaType: ResourceLibraryMediaType;
  view: ResourceLibraryView;
  total: number;
};

export type ResourceLibraryGenerationSelection = {
  generationId: string;
  resultIndex: number;
};

export type ResourceLibraryAssetStatus = ResourceLibraryGenerationSelection & {
  assetId: string | null;
  saved: boolean;
};

export type UserPrompt = {
  id: string;
  title: string;
  content: string;
  creationType: string;
  moduleKey: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type UserPromptListResponse = {
  items: UserPrompt[];
  hasMore: boolean;
  nextCursor: string | null;
};

export const RESOURCE_LIBRARY_MODULE_LABELS: Record<string, string> = {
  tryon: "服装上身",
  grass: "种草图",
  productRetouch: "商品精修",
  productSet: "商品套图",
  modelBackground: "模特换背景",
  materialEnhancement: "材质增强",
  generalImage: "通用生图",
  outfitFusion: "搭配融图",
  pose: "姿势裂变",
  model: "专属模特",
  garment3d: "服装 3D",
  faceSwap: "换脸",
  imageTranslation: "图片翻译",
  commerceDetail: "商品详情图",
  allCategoryProductImage: "全品类商品图",
  videoImageToVideo: "图生视频",
  videoMotion: "动作迁移",
  videoFirstLastFrame: "首尾帧视频",
};

export function getResourceLibraryModuleLabel(moduleKey: string | null | undefined) {
  if (!moduleKey) return "我的资源";
  return RESOURCE_LIBRARY_MODULE_LABELS[moduleKey] || moduleKey;
}

export function createGenerationAssetOriginKey(generationId: string, resultIndex: number) {
  return `generation:${generationId}:${resultIndex}`;
}
