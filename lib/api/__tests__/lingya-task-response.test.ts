import { describe, expect, it } from "vitest";
import { __lingyaTaskResponseTestUtils } from "../lingya";

const { extractGeneratedImages, normalizeImageTaskResponse } = __lingyaTaskResponseTestUtils;

describe("lingya async task response parsing", () => {
  it("extracts generated image URLs from nested provider result fields", () => {
    const state = normalizeImageTaskResponse({
      data: {
        task_id: "task-1",
        status: "SUCCESS",
        output: {
          results: [
            { file_url: "https://example.com/generated-a.png" },
            { downloadUrl: "https://example.com/generated-b.png" },
          ],
        },
      },
    }, "fallback-task");

    expect(state.status).toBe("completed");
    expect(state.progress).toBe(100);
    expect(state.urls).toEqual([
      "https://example.com/generated-a.png",
      "https://example.com/generated-b.png",
    ]);
  });

  it("keeps a successful task running while the result URL is not ready yet", () => {
    const state = normalizeImageTaskResponse({
      data: {
        task_id: "task-2",
        status: "SUCCESS",
        progress: 100,
        output: {},
      },
    }, "fallback-task");

    expect(state.status).toBe("running");
    expect(state.providerStatus).toBe("SUCCESS");
    expect(state.progress).toBe(99);
    expect(state.urls).toEqual([]);
  });

  it("does not treat echoed input/reference images as generated results", () => {
    const images = extractGeneratedImages({
      status: "RUNNING",
      input: {
        image_url: "https://example.com/source.png",
      },
      request: {
        reference_url: "https://example.com/reference.png",
      },
    });

    expect(images.urls).toEqual([]);
  });
});
