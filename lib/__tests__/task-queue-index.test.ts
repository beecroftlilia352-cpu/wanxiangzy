import { describe, expect, it } from "vitest";

import {
  indexRowToTaskQueueItem,
  normalizeGenerationTaskQueueItem,
  taskQueueItemToIndexWrite,
} from "../task-queue-index";

describe("task queue index", () => {
  it("normalizes a generation into the lightweight queue shape", () => {
    const item = normalizeGenerationTaskQueueItem({
      id: "gen_1",
      user_id: "user_1",
      status: "processing_tryon",
      error_message: null,
      result_urls: ["https://example.com/result.png"],
      created_at: "2026-05-16T10:00:00.000Z",
      completed_at: null,
      processing_started_at: "2026-05-16T10:00:10.000Z",
      job_payload: {
        kind: "productSet",
        genCount: 3,
        productImageUrls: ["https://example.com/product.png"],
      },
      clothing_urls: [],
      model_face_url: null,
      reference_url: null,
    });

    expect(item.module).toBe("productSet");
    expect(item.title).toBe("商品套图");
    expect(item.resultThumbnails).toEqual(["https://example.com/result.png"]);
    expect(item.inputThumbnails).toEqual(["https://example.com/product.png"]);
    expect(item.expectedCount).toBe(3);
  });

  it("round-trips through the task_queue_items row shape without large payload fields", () => {
    const item = normalizeGenerationTaskQueueItem({
      id: "gen_2",
      user_id: "user_1",
      status: "completed",
      error_message: null,
      result_urls: ["https://example.com/one.png", "https://example.com/two.png", "https://example.com/three.png"],
      created_at: "2026-05-16T10:00:00.000Z",
      completed_at: "2026-05-16T10:01:00.000Z",
      job_payload: { kind: "tryon", genCount: 3 },
      clothing_urls: ["https://example.com/clothing.png"],
      model_face_url: null,
      reference_url: null,
    });

    const row = taskQueueItemToIndexWrite(item, {
      userId: "user_1",
      sourceType: "generation",
    });

    expect(Object.keys(row)).not.toContain("job_payload");
    expect(Object.keys(row)).not.toContain("result_urls");
    expect(row.result_thumbnails).toHaveLength(2);
    expect(indexRowToTaskQueueItem(row).resultCount).toBe(3);
  });

  it("multiplies try-on expected count by selected reference count", () => {
    const item = normalizeGenerationTaskQueueItem({
      id: "gen_3",
      user_id: "user_1",
      status: "processing_tryon",
      error_message: null,
      result_urls: [],
      created_at: "2026-05-16T10:00:00.000Z",
      completed_at: null,
      job_payload: {
        kind: "tryon",
        genCount: 2,
        referenceUrls: [
          "https://example.com/ref-1.png",
          "https://example.com/ref-2.png",
          "https://example.com/ref-3.png",
        ],
      },
      clothing_urls: ["https://example.com/clothing.png"],
      model_face_url: null,
      reference_url: null,
    });

    expect(item.expectedCount).toBe(6);
    expect(item.inputThumbnails).toEqual([
      "https://example.com/clothing.png",
      "https://example.com/ref-1.png",
      "https://example.com/ref-2.png",
      "https://example.com/ref-3.png",
    ]);
  });
});
