import { describe, expect, it } from "vitest";
import {
  assetUrls,
  createResourceSelectionReducer,
  getResourcePickerBudget,
  isResourceAssetExcluded,
  type ResourceSelectionState,
} from "@/features/resource-library/selection";
import type { ResourceAsset, ResourcePickerRequest } from "@/features/resource-library/types";

function asset(id: string, url = `https://example.com/${id}.png`): ResourceAsset {
  const timestamp = "2026-08-17T08:00:00.000Z";
  return {
    id,
    url,
    previewUrl: null,
    sourceType: "upload",
    mediaType: "image",
    moduleKey: null,
    sourceGenerationId: null,
    sourceResultIndex: null,
    groupKey: null,
    groupTotal: 1,
    title: id,
    originalFilename: `${id}.png`,
    mimeType: "image/png",
    byteSize: null,
    width: null,
    height: null,
    durationMs: null,
    metadata: {},
    savedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

const EMPTY: ResourceSelectionState = { selected: [], limitReached: false };

describe("resource library picker selection", () => {
  it("subtracts existing slots from the multi-select budget", () => {
    const request: ResourcePickerRequest = { selectionMode: "multiple", maxCount: 5, existingCount: 3 };
    expect(getResourcePickerBudget(request)).toBe(2);

    const reduce = createResourceSelectionReducer(request);
    const one = reduce(EMPTY, { type: "toggle", asset: asset("one") });
    const two = reduce(one, { type: "toggle", asset: asset("two") });
    const over = reduce(two, { type: "toggle", asset: asset("three") });
    expect(over.selected.map((item) => item.id)).toEqual(["one", "two"]);
    expect(over.limitReached).toBe(true);
  });

  it("replaces the draft in single-select mode and keeps category-independent assets", () => {
    const reduce = createResourceSelectionReducer({ selectionMode: "single", maxCount: 9 });
    const first = reduce(EMPTY, { type: "toggle", asset: asset("upload") });
    const replaced = reduce(first, { type: "toggle", asset: asset("generated") });
    expect(replaced.selected.map((item) => item.id)).toEqual(["generated"]);

    const multi = createResourceSelectionReducer({ selectionMode: "multiple", maxCount: 3 });
    const acrossCategories = multi(
      multi(EMPTY, { type: "toggle", asset: asset("upload") }),
      { type: "toggle", asset: { ...asset("generated"), sourceType: "generation", moduleKey: "pose" } },
    );
    expect(acrossCategories.selected.map((item) => item.id)).toEqual(["upload", "generated"]);
  });

  it("excludes already-applied ids and normalizes volatile OSS query parameters", () => {
    const existing = asset("existing", "https://cdn.test/a.png?x-oss-process=image/resize,w_200");
    const request: ResourcePickerRequest = {
      selectionMode: "multiple",
      maxCount: 4,
      excludedUrls: ["https://cdn.test/a.png"],
      excludedAssetIds: ["asset-id"],
    };
    expect(isResourceAssetExcluded(existing, request)).toBe(true);
    expect(isResourceAssetExcluded(asset("asset-id"), request)).toBe(true);
    expect(createResourceSelectionReducer(request)(EMPTY, { type: "toggle", asset: existing })).toBe(EMPTY);
  });

  it("returns URL helpers without leaking cancel state", () => {
    expect(assetUrls(null)).toEqual([]);
    expect(assetUrls([asset("a"), asset("b")])).toEqual([
      "https://example.com/a.png",
      "https://example.com/b.png",
    ]);
  });
});
