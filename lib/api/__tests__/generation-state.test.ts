import { describe, expect, it } from "vitest";
import {
  GENERATION_PROCESSING_STATUS_FILTERS,
  GENERATION_RUNNING_STATUS_FILTERS,
  normalizeGenerationState,
  normalizeGenerationStatus,
} from "../generation-state";

describe("normalizeGenerationState", () => {
  it("keeps multi-image jobs running when only one child task has succeeded", () => {
    const state = normalizeGenerationState({
      status: "processing_tryon",
      resultUrls: ["https://example.com/one.png"],
      payload: {
        genCount: 3,
        asyncTask: {
          status: "SUCCESS",
          progress: 33,
        },
      },
    });

    expect(state.status).toBe("processing");
    expect(state.statusGroup).toBe("running");
    expect(state.progress).toBeLessThan(100);
    expect(state.resultCount).toBe(1);
    expect(state.expectedCount).toBe(3);
  });

  it("marks a multi-image job completed once all expected results are present", () => {
    const state = normalizeGenerationState({
      status: "processing_tryon",
      resultUrls: [
        "https://example.com/one.png",
        "https://example.com/two.png",
        "https://example.com/three.png",
      ],
      payload: {
        genCount: 3,
        asyncTask: {
          status: "SUCCESS",
          progress: 100,
        },
      },
    });

    expect(state.status).toBe("completed");
    expect(state.statusGroup).toBe("finished");
    expect(state.progress).toBe(100);
  });

  it("trusts an explicit completed database status", () => {
    const state = normalizeGenerationState({
      status: "completed",
      resultUrls: ["https://example.com/one.png"],
      payload: { genCount: 3 },
    });

    expect(state.status).toBe("completed");
    expect(state.statusGroup).toBe("finished");
    expect(state.progress).toBe(100);
  });

  it("uses product-set module results for progress and expected count", () => {
    const state = normalizeGenerationState({
      status: "processing_tryon",
      resultUrls: ["https://example.com/hero.png"],
      payload: {
        genCount: 6,
        moduleResults: [
          {
            moduleKey: "preset:108",
            index: 1,
            templateId: "108",
            templateSource: "preset",
            name: "Hero",
            imageType: "details",
            aspectRatio: "9:16",
            status: "completed",
            progress: 100,
            resultUrl: "https://example.com/hero.png",
          },
          {
            moduleKey: "preset:7",
            index: 2,
            templateId: "7",
            templateSource: "preset",
            name: "Model",
            imageType: "details",
            aspectRatio: "3:4",
            status: "running",
            progress: 50,
          },
        ],
      },
    });

    expect(state.status).toBe("processing");
    expect(state.expectedCount).toBe(2);
    expect(state.resultCount).toBe(1);
    expect(state.progress).toBe(75);
    expect(state.moduleResults?.[0].moduleKey).toBe("preset:108");
  });

  it("normalizes database running aliases to stable API statuses", () => {
    expect(normalizeGenerationStatus("queued")).toBe("pending");
    expect(normalizeGenerationStatus("pending")).toBe("pending");
    expect(normalizeGenerationStatus("processing_tryon")).toBe("processing");
    expect(normalizeGenerationStatus("processing_face_swap")).toBe("processing");
    expect(normalizeGenerationStatus("running")).toBe("processing");
    expect(normalizeGenerationStatus("completed")).toBe("completed");
    expect(normalizeGenerationStatus("failed")).toBe("failed");
  });

  it("keeps legacy processing_tryon in running filters for workers and queue queries", () => {
    expect(GENERATION_PROCESSING_STATUS_FILTERS).toContain("processing_tryon");
    expect(GENERATION_PROCESSING_STATUS_FILTERS).toContain("processing_face_swap");
    expect(GENERATION_RUNNING_STATUS_FILTERS).toContain("queued");
    expect(GENERATION_RUNNING_STATUS_FILTERS).toContain("processing_tryon");
  });
});
