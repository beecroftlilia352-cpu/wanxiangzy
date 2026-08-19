import { describe, expect, it, vi } from "vitest";
import {
  ResourceLibraryError,
  normalizeAssetStatusRequest,
  normalizeGenerationAssetRequest,
  normalizeUserPromptPayload,
  parseResourceLibraryAssetListQuery,
  resourceLibraryAssetRowToClient,
  saveGenerationAssets,
} from "@/lib/resource-library/server";

const GENERATION_ID = "2b5d98f0-8e4f-4f62-95c8-98dc30a432cb";

describe("resource library server helpers", () => {
  it("normalizes asset filters and clamps the page size", () => {
    expect(parseResourceLibraryAssetListQuery(new URLSearchParams({
      source: "generation",
      module: " productRetouch ",
      media: "image",
      view: "group",
      limit: "999",
    }))).toEqual({
      source: "generation",
      moduleKey: "productRetouch",
      mediaType: "image",
      view: "group",
      cursor: null,
      limit: 60,
    });
  });

  it("requires unique, bounded generation result indexes", () => {
    expect(normalizeGenerationAssetRequest({ generationId: GENERATION_ID, resultIndexes: [2, 0] }))
      .toEqual({ generationId: GENERATION_ID, resultIndexes: [0, 2] });

    expect(() => normalizeGenerationAssetRequest({ generationId: GENERATION_ID, resultIndexes: [0, 0] }))
      .toThrowError(ResourceLibraryError);
    expect(() => normalizeGenerationAssetRequest({ generationId: "not-a-uuid", resultIndex: 0 }))
      .toThrowError(expect.objectContaining({ code: "INVALID_GENERATION_ID", status: 400 }));
  });

  it("validates bounded batch status descriptors", () => {
    expect(normalizeAssetStatusRequest({ items: [{ generationId: GENERATION_ID, resultIndex: 1 }] }))
      .toEqual([{ generationId: GENERATION_ID, resultIndex: 1 }]);
    expect(() => normalizeAssetStatusRequest({ items: [] }))
      .toThrowError(expect.objectContaining({ code: "INVALID_STATUS_ITEMS" }));
  });

  it("normalizes prompt data while rejecting empty partial updates", () => {
    expect(normalizeUserPromptPayload({
      title: "  夏日海报 ",
      content: "  product photo  ",
      creationType: "textToImage",
      moduleKey: "generalImage",
      tags: ["电商", "电商", "夏日"],
    })).toEqual({
      title: "夏日海报",
      content: "product photo",
      creation_type: "textToImage",
      module_key: "generalImage",
      tags: ["电商", "夏日"],
    });
    expect(() => normalizeUserPromptPayload({}, { partial: true }))
      .toThrowError(expect.objectContaining({ code: "EMPTY_PROMPT_UPDATE" }));
  });

  it("maps database rows to the stable client contract", () => {
    expect(resourceLibraryAssetRowToClient({
      id: "asset-id",
      url: "https://cdn.example.com/result.png",
      preview_url: "https://cdn.example.com/result-preview.png",
      source_type: "generation",
      media_type: "image",
      module_key: "productRetouch",
      source_generation_id: GENERATION_ID,
      source_result_index: 0,
      group_total: 2,
      title: "商品精修 1",
      metadata: { quality: "commercial" },
      saved_at: "2026-08-17T08:00:00.000Z",
      created_at: "2026-08-17T08:00:00.000Z",
      updated_at: "2026-08-17T08:00:00.000Z",
    })).toMatchObject({
      id: "asset-id",
      url: "https://cdn.example.com/result.png",
      previewUrl: "https://cdn.example.com/result-preview.png",
      thumbnailUrl: "https://cdn.example.com/result-preview.png",
      sourceType: "generation",
      mediaType: "image",
      moduleKey: "productRetouch",
      sourceGenerationId: GENERATION_ID,
      sourceResultIndex: 0,
      groupTotal: 2,
      metadata: { quality: "commercial" },
    });
  });

  it("derives saved asset URLs and module metadata from the owned generation", async () => {
    const generationQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(),
    };
    generationQuery.select.mockReturnValue(generationQuery);
    generationQuery.eq.mockReturnValue(generationQuery);
    generationQuery.maybeSingle.mockResolvedValue({
      data: {
        id: GENERATION_ID,
        user_id: "user-1",
        status: "completed",
        result_urls: [
          "https://bucket.oss-cn-hongkong.aliyuncs.com/result-1.png",
          "https://bucket.oss-cn-hongkong.aliyuncs.com/result-2.png",
        ],
        job_payload: { kind: "productRetouch", genCount: 2 },
        created_at: "2026-08-17T08:00:00.000Z",
        completed_at: "2026-08-17T08:02:00.000Z",
      },
      error: null,
    });

    let insertedRows: Array<Record<string, unknown>> = [];
    const assetQuery = {
      upsert: vi.fn(),
      select: vi.fn(),
    };
    assetQuery.upsert.mockImplementation((rows: Array<Record<string, unknown>>) => {
      insertedRows = rows;
      return assetQuery;
    });
    assetQuery.select.mockImplementation(async () => ({
      data: insertedRows.map((row, index) => ({
        id: `asset-${index + 1}`,
        ...row,
        saved_at: "2026-08-17T08:03:00.000Z",
        created_at: "2026-08-17T08:03:00.000Z",
        updated_at: "2026-08-17T08:03:00.000Z",
      })),
      error: null,
    }));

    const supabase = {
      from: vi.fn((table: string) => table === "generations" ? generationQuery : assetQuery),
    };
    const assets = await saveGenerationAssets(supabase as never, "user-1", {
      generationId: GENERATION_ID,
      resultIndex: 1,
      // Untrusted client metadata must be ignored.
      url: "https://attacker.example/forged.png",
      moduleKey: "forged",
    });

    expect(generationQuery.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(assetQuery.upsert).toHaveBeenCalledWith(
      [expect.objectContaining({
        user_id: "user-1",
        url: "https://bucket.oss-cn-hongkong.aliyuncs.com/result-2.png",
        module_key: "productRetouch",
        source_generation_id: GENERATION_ID,
        source_result_index: 1,
        origin_key: `generation:${GENERATION_ID}:1`,
        storage_provider: "aliyun-oss",
      })],
      { onConflict: "user_id,origin_key" },
    );
    expect(assets[0]).toMatchObject({
      url: "https://bucket.oss-cn-hongkong.aliyuncs.com/result-2.png",
      moduleKey: "productRetouch",
      sourceResultIndex: 1,
    });
  });
});
