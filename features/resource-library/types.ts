import type {
  ResourceLibraryAsset,
  ResourceLibraryAssetSource,
  ResourceLibraryMediaType,
  ResourceLibraryView,
  UserPrompt,
} from "@/lib/resource-library/types";

export type ResourceMediaType = ResourceLibraryMediaType;

export type ResourceAssetSource = ResourceLibraryAssetSource;

export type ResourceAssetView = ResourceLibraryView;

export type ResourceAsset = ResourceLibraryAsset;

export type ResourceFacet = {
  key: string;
  label?: string | null;
  count: number;
};

export type ResourceLibraryFacets = {
  modules: ResourceFacet[];
  media: ResourceFacet[];
  views: ResourceFacet[];
};

export type ResourcePickerRequest = {
  title?: string;
  role?: string;
  selectionMode: "single" | "multiple";
  maxCount: number;
  existingCount?: number;
  mediaTypes?: ResourceMediaType[];
  view?: ResourceAssetView;
  moduleKey?: string;
  excludedAssetIds?: string[];
  excludedUrls?: string[];
};

export type ResourcePickerResult = ResourceAsset[] | null;

export type ResourceAssetsQuery = {
  source?: ResourceAssetSource;
  module?: string;
  media?: ResourceMediaType;
  view?: ResourceAssetView;
  cursor?: string | null;
  limit?: number;
};

export type ResourceAssetsPage = {
  items: ResourceAsset[];
  hasMore: boolean;
  nextCursor: string | null;
};

export type ResourcePrompt = UserPrompt;

export type ResourcePromptInput = Pick<ResourcePrompt, "title" | "content"> & {
  creationType: string;
  moduleKey?: string;
  tags?: string[];
};

export type ResourcePromptsQuery = {
  creationType?: string;
  module?: string;
  q?: string;
  cursor?: string | null;
  limit?: number;
};

export type ResourcePromptsPage = {
  items: ResourcePrompt[];
  hasMore: boolean;
  nextCursor: string | null;
};
