import { describe, expect, it } from "vitest";

import {
  __generationJobTestUtils,
  type GenerationJobPayload,
} from "@/lib/api/generation-jobs";

const basePayload: GenerationJobPayload = {
  kind: "generalImage",
  mode: "text-to-image",
  referenceUrls: [],
  aiModel: "nano-banana-2",
  aspectRatio: "1:1",
  imageSize: "1K",
  prompt: "catalog image",
  genCount: 4,
};

describe("generation batch capacity resume", () => {
  it("persists stable result slots and restores only the completed slots", () => {
    const first = "/api/media-assets/6ba7b810-9dad-41d1-80b4-00c04fd430c8";
    const third = "/api/media-assets/6ba7b811-9dad-41d1-80b4-00c04fd430c8";
    const payload = __generationJobTestUtils.appendResumableBatchProgress(basePayload, {
      resultUrls: [first, "", third, ""],
      promptTrace: [],
      progress: 50,
    });

    expect(payload.generationBatchProgress).toMatchObject({
      version: 1,
      expectedCount: 4,
      resultUrls: [first, "", third, ""],
    });
    expect(__generationJobTestUtils.readResumableBatchResultUrls(payload, 4)).toEqual([
      first,
      "",
      third,
      "",
    ]);
    expect(__generationJobTestUtils.isCanonicalMediaAssetUrl(first)).toBe(true);
    expect(__generationJobTestUtils.isCanonicalMediaAssetUrl("https://oss.example/raw.png?Signature=secret")).toBe(false);
  });

  it("rejects stale resume state when the requested output count changes", () => {
    const payload: GenerationJobPayload = {
      ...basePayload,
      generationBatchProgress: {
        version: 1,
        expectedCount: 4,
        resultUrls: ["one", "two", "", ""],
        updatedAt: new Date().toISOString(),
      },
    };

    expect(__generationJobTestUtils.readResumableBatchResultUrls(payload, 2)).toEqual(["", ""]);
  });

  it("removes internal resume metadata before final settlement", () => {
    const payload: GenerationJobPayload = {
      ...basePayload,
      generationBatchProgress: {
        version: 1,
        expectedCount: 4,
        resultUrls: ["one", "two", "three", "four"],
        updatedAt: new Date().toISOString(),
      },
    };

    expect(__generationJobTestUtils.clearResumableBatchProgress(payload))
      .not.toHaveProperty("generationBatchProgress");
  });
});
