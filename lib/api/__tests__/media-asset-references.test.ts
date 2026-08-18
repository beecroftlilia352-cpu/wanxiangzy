import { describe, expect, it, vi } from "vitest";
import {
  attachGenerationMediaAssetReferences,
  collectGenerationInputMediaAssetIds,
  parseCanonicalMediaAssetId,
} from "../media-asset-references.server";

const first = "6ba7b810-9dad-41d1-80b4-00c04fd430c8";
const second = "6ba7b811-9dad-41d1-80b4-00c04fd430c8";

describe("media asset generation references", () => {
  it("collects owner-fenced canonical inputs while ignoring internal output checkpoints", () => {
    const payload = {
      imageUrl: `/api/media-assets/${first}`,
      nested: { references: [`/api/media-assets/${second}`, `/api/media-assets/${first}`] },
      generationBatchProgress: {
        resultUrls: ["/api/media-assets/6ba7b812-9dad-41d1-80b4-00c04fd430c8"],
      },
    };

    expect(collectGenerationInputMediaAssetIds(payload)).toEqual([first, second]);
    expect(parseCanonicalMediaAssetId(`/api/media-assets/${first}`)).toBe(first);
    expect(parseCanonicalMediaAssetId(`https://oss.example/a.png?Signature=secret`)).toBeNull();
  });

  it("attaches deterministic, idempotent generation roles", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: "0f09a8f0-cd3d-4b20-9122-2ab8cb964019", error: null })
      .mockResolvedValueOnce({ data: "0f09a8f1-cd3d-4b20-9122-2ab8cb964019", error: null });

    await attachGenerationMediaAssetReferences({
      client: { rpc },
      generationId: "0f09a8f2-cd3d-4b20-9122-2ab8cb964019",
      ownerUserId: "0f09a8f3-cd3d-4b20-9122-2ab8cb964019",
      assetIds: [first, first, second],
      role: "generation_result",
    });

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(1, "attach_media_asset_reference", expect.objectContaining({
      p_asset_id: first,
      p_asset_role: "generation_result",
      p_ordinal: 0,
    }));
    expect(rpc).toHaveBeenNthCalledWith(2, "attach_media_asset_reference", expect.objectContaining({
      p_asset_id: second,
      p_ordinal: 1,
    }));
  });
});
