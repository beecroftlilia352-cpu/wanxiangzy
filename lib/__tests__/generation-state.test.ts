import { describe, expect, it } from "vitest";

import {
  isRunningStatus,
  normalizeGenerationState,
  normalizeGenerationStatus,
} from "@/lib/api/generation-state";

describe("generation-state", () => {
  it("normalizes provider and legacy statuses to canonical filter buckets", () => {
    expect(normalizeGenerationStatus("queued")).toBe("pending");
    expect(normalizeGenerationStatus("processing_tryon")).toBe("processing");
    expect(normalizeGenerationStatus("PROCESSING_FACE_SWAP")).toBe("processing");
    expect(normalizeGenerationStatus("succeeded")).toBe("completed");
    expect(normalizeGenerationStatus("success")).toBe("completed");
    expect(normalizeGenerationStatus("error")).toBe("failed");
    expect(normalizeGenerationStatus("cancelled")).toBe("failed");
    expect(normalizeGenerationStatus("canceled")).toBe("failed");
  });

  it("keeps running aliases grouped as running statuses", () => {
    expect(isRunningStatus("pending")).toBe(true);
    expect(isRunningStatus("processing_tryon")).toBe(true);
    expect(isRunningStatus("generating")).toBe(true);
    expect(isRunningStatus("processing_model_background")).toBe(true);
    expect(isRunningStatus("completed")).toBe(false);
    expect(isRunningStatus("succeeded")).toBe(false);
    expect(isRunningStatus("failed")).toBe(false);
  });

  it("marks enough generated results as completed even when provider status is stale", () => {
    const state = normalizeGenerationState({
      status: "processing_tryon",
      resultUrls: ["https://example.com/1.png", "https://example.com/2.png"],
      payload: { genCount: 2 },
    });

    expect(state.status).toBe("completed");
    expect(state.statusGroup).toBe("finished");
    expect(state.progress).toBe(100);
    expect(state.resultCount).toBe(2);
    expect(state.expectedCount).toBe(2);
  });

  it("keeps multi-reference try-on running until every reference result is present", () => {
    const state = normalizeGenerationState({
      status: "processing_tryon",
      resultUrls: ["https://example.com/1.png"],
      payload: {
        kind: "tryon",
        genCount: 1,
        referenceUrls: [
          "https://example.com/ref-1.png",
          "https://example.com/ref-2.png",
        ],
      },
    });

    expect(state.status).toBe("processing");
    expect(state.statusGroup).toBe("running");
    expect(state.progress).toBe(50);
    expect(state.resultCount).toBe(1);
    expect(state.expectedCount).toBe(2);
  });

  it("completes multi-reference try-on only after all reference results are present", () => {
    const state = normalizeGenerationState({
      status: "processing_tryon",
      resultUrls: ["https://example.com/1.png", "https://example.com/2.png"],
      payload: {
        kind: "tryon",
        genCount: 1,
        referenceUrls: [
          "https://example.com/ref-1.png",
          "https://example.com/ref-2.png",
        ],
      },
    });

    expect(state.status).toBe("completed");
    expect(state.statusGroup).toBe("finished");
    expect(state.progress).toBe(100);
    expect(state.resultCount).toBe(2);
    expect(state.expectedCount).toBe(2);
  });

  it("multiplies face-swap expected count by source image count", () => {
    const state = normalizeGenerationState({
      status: "processing_face_swap",
      resultUrls: ["https://example.com/1.png"],
      payload: {
        kind: "faceSwap",
        genCount: 1,
        sourceUrls: [
          "https://example.com/source-1.png",
          "https://example.com/source-2.png",
        ],
      },
    });

    expect(state.status).toBe("processing");
    expect(state.statusGroup).toBe("running");
    expect(state.resultCount).toBe(1);
    expect(state.expectedCount).toBe(2);
  });

  it("multiplies image-translation count by sources, languages, and per-language outputs", () => {
    const state = normalizeGenerationState({
      status: "processing_tryon",
      resultUrls: ["https://example.com/translated-1.png"],
      payload: {
        kind: "imageTranslation",
        sourceUrls: [
          "https://example.com/source-1.png",
          "https://example.com/source-2.png",
        ],
        languages: ["es", "en"],
        genCount: 2,
      },
    });

    expect(state.status).toBe("processing");
    expect(state.statusGroup).toBe("running");
    expect(state.resultCount).toBe(1);
    expect(state.expectedCount).toBe(8);
  });

  it("keeps explicit failed status finished without promoting partial results", () => {
    const state = normalizeGenerationState({
      status: "error",
      resultUrls: ["https://example.com/1.png"],
      payload: { genCount: 3, asyncTask: { status: "failed", progress: 66 } },
    });

    expect(state.status).toBe("failed");
    expect(state.statusGroup).toBe("finished");
    expect(state.progress).toBe(66);
    expect(state.resultCount).toBe(1);
    expect(state.expectedCount).toBe(3);
  });

  it("uses module result progress for product-set plans", () => {
    const state = normalizeGenerationState({
      status: "processing",
      payload: {
        moduleResults: [
          { moduleKey: "hero", name: "Hero", status: "completed", resultUrl: "https://example.com/a.png" },
          { moduleKey: "detail", name: "Detail", status: "processing", progress: 40 },
          { moduleKey: "scene", name: "Scene", status: "pending" },
        ],
      },
    });

    expect(state.status).toBe("processing");
    expect(state.statusGroup).toBe("running");
    expect(state.resultCount).toBe(1);
    expect(state.expectedCount).toBe(3);
    expect(state.progress).toBe(47);
  });
});
