import type { ResourceAsset, ResourcePickerRequest, ResourcePickerResult } from "./types";

export type ResourceSelectionState = {
  selected: ResourceAsset[];
  limitReached: boolean;
};

export type ResourceSelectionAction =
  | { type: "toggle"; asset: ResourceAsset }
  | { type: "clear" };

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url, "https://resource-library.local");
    parsed.hash = "";
    ["x-oss-process", "Expires", "OSSAccessKeyId", "Signature"].forEach((key) => {
      parsed.searchParams.delete(key);
    });
    return `${parsed.origin}${parsed.pathname}${parsed.search}`;
  } catch {
    return url.trim();
  }
}

export function resourceAssetIdentity(asset: Pick<ResourceAsset, "id" | "url">): string {
  return asset.id || normalizeUrl(asset.url);
}

export function getResourcePickerBudget(request: ResourcePickerRequest): number {
  if (request.selectionMode === "single") return 1;
  return Math.max(0, request.maxCount - Math.max(0, request.existingCount ?? 0));
}

export function isResourceAssetExcluded(
  asset: ResourceAsset,
  request: ResourcePickerRequest,
): boolean {
  if (request.excludedAssetIds?.includes(asset.id)) return true;
  const assetUrl = normalizeUrl(asset.url);
  return Boolean(request.excludedUrls?.some((url) => normalizeUrl(url) === assetUrl));
}

export function createResourceSelectionReducer(request: ResourcePickerRequest) {
  const budget = getResourcePickerBudget(request);

  return (
    state: ResourceSelectionState,
    action: ResourceSelectionAction,
  ): ResourceSelectionState => {
    if (action.type === "clear") return { selected: [], limitReached: false };
    if (isResourceAssetExcluded(action.asset, request)) return state;

    const identity = resourceAssetIdentity(action.asset);
    const exists = state.selected.some((asset) => resourceAssetIdentity(asset) === identity);
    if (exists) {
      return {
        selected: state.selected.filter((asset) => resourceAssetIdentity(asset) !== identity),
        limitReached: false,
      };
    }

    if (request.selectionMode === "single") {
      return { selected: [action.asset], limitReached: false };
    }

    if (state.selected.length >= budget) {
      return { ...state, limitReached: true };
    }

    const selected = [...state.selected, action.asset];
    return { selected, limitReached: selected.length >= budget };
  };
}

export function assetUrls(result: ResourcePickerResult | undefined): string[] {
  return result?.map((asset) => asset.url) ?? [];
}
