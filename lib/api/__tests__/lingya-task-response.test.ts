import { describe, expect, it } from "vitest";
import { __lingyaTaskResponseTestUtils } from "../lingya";

const {
  extractGeneratedImages,
  getImageGenerationUrl,
  getPlatoApiBaseUrl,
  normalizeImageTaskResponse,
  resolveProviderImageModel,
  shouldRequestAsyncImageTask,
} = __lingyaTaskResponseTestUtils;

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

  it("uses synchronous image generation for Plato and async tasks for Lingya", () => {
    expect(shouldRequestAsyncImageTask({ name: "plato" })).toBe(false);
    expect(shouldRequestAsyncImageTask({ name: "lingya" })).toBe(true);
    expect(getImageGenerationUrl("https://api.bltcy.ai/v1", { name: "plato" }))
      .toBe("https://api.bltcy.ai/v1/images/generations");
    expect(getImageGenerationUrl("https://api.lingyaai.cn/v1", { name: "lingya" }))
      .toBe("https://api.lingyaai.cn/v1/images/generations?async=true");
  });

  it("can override Plato gpt-image-2 with a provider-specific model id", () => {
    const previous = process.env.PLATO_GPT_IMAGE_MODEL;
    delete process.env.PLATO_GPT_IMAGE_MODEL;

    expect(resolveProviderImageModel("gpt-image-2", { name: "plato" })).toBe("gpt-image-2-vip");

    process.env.PLATO_GPT_IMAGE_MODEL = "gpt-image-2-custom";

    expect(resolveProviderImageModel("gpt-image-2", { name: "plato" })).toBe("gpt-image-2-custom");
    expect(resolveProviderImageModel("gpt-image-2", { name: "lingya" })).toBe("gpt-image-2");
    expect(resolveProviderImageModel("nano-banana-2", { name: "plato" })).toBe("nano-banana-2");

    if (previous === undefined) {
      delete process.env.PLATO_GPT_IMAGE_MODEL;
    } else {
      process.env.PLATO_GPT_IMAGE_MODEL = previous;
    }
  });

  it("routes deprecated Plato base URL to the LaoZhang provider by default", () => {
    const previous = process.env.PLATO_BASE_URL;
    process.env.PLATO_BASE_URL = "https://api.bltcy.ai";

    expect(getPlatoApiBaseUrl()).toBe("https://api.laozhang.ai/v1");

    process.env.PLATO_BASE_URL = "https://api.example.com/proxy";
    expect(getPlatoApiBaseUrl()).toBe("https://api.example.com/proxy/v1");

    if (previous === undefined) {
      delete process.env.PLATO_BASE_URL;
    } else {
      process.env.PLATO_BASE_URL = previous;
    }
  });
});
