import { describe, expect, it } from "vitest";
import { __lingyaTaskResponseTestUtils } from "../lingya";

const {
  buildImageEditRequest,
  buildLaozhangNativeImageRequest,
  buildGenerateRequestBody,
  calculateImageRequestHeartbeatProgress,
  extractGeneratedImages,
  getImageEditUrl,
  getImageGenerationUrl,
  getLaozhangGenerateContentUrl,
  getPlatoApiBaseUrl,
  normalizeImageTaskResponse,
  resolveGptImage2Size,
  resolveProviderImageModel,
  shouldUseLaozhangNativeEndpoint,
  shouldUseImageEditEndpoint,
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

  it("extracts inline images from LaoZhang native Gemini responses", () => {
    const images = extractGeneratedImages({
      candidates: [{
        content: {
          parts: [{
            inlineData: {
              mimeType: "image/jpeg",
              data: "aGVsbG8=",
            },
          }],
        },
      }],
    });

    expect(images.urls).toEqual([]);
    expect(images.b64Json).toBe("data:image/jpeg;base64,aGVsbG8=");
  });

  it("uses synchronous image generation for Plato and async tasks for Lingya", () => {
    expect(shouldRequestAsyncImageTask({ name: "plato" })).toBe(false);
    expect(shouldRequestAsyncImageTask({ name: "laozhang" })).toBe(false);
    expect(shouldRequestAsyncImageTask({ name: "lingya" })).toBe(true);
    expect(getImageGenerationUrl("https://api.bltcy.ai/v1", { name: "plato" }))
      .toBe("https://api.bltcy.ai/v1/images/generations");
    expect(getImageGenerationUrl("https://api.lingyaai.cn/v1", { name: "lingya" }))
      .toBe("https://api.lingyaai.cn/v1/images/generations?async=true");
  });

  it("routes nano banana models through LaoZhang native generateContent", async () => {
    const request = await buildLaozhangNativeImageRequest({
      apiBase: "https://api.laozhang.ai",
      apiKey: "test-key",
      model: "gemini-3.1-flash-image-preview",
      prompt: "generate a red cup",
      imageUrls: [],
      aspectRatio: "3:4",
      imageSize: "2K",
    });

    expect(shouldUseLaozhangNativeEndpoint({ model: "nano-banana-2" }, { name: "laozhang" }))
      .toBe(true);
    expect(getLaozhangGenerateContentUrl("https://api.laozhang.ai", "gemini-3.1-flash-image-preview"))
      .toBe("https://api.laozhang.ai/v1beta/models/gemini-3.1-flash-image-preview:generateContent");
    expect(request.url).toBe("https://api.laozhang.ai/v1beta/models/gemini-3.1-flash-image-preview:generateContent");
    expect(request.init.headers).toMatchObject({ "x-goog-api-key": "test-key", "Content-Type": "application/json" });
    expect(JSON.parse(String(request.init.body))).toMatchObject({
      contents: [{ role: "user", parts: [{ text: "generate a red cup" }] }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        imageConfig: { aspectRatio: "3:4", imageSize: "2K" },
      },
    });
  });

  it("routes gpt-image-2 reference image requests through image edits", () => {
    const body = buildGenerateRequestBody({
      model: "gpt-image-2",
      prompt: "swap the face",
      aspect_ratio: "9:16",
      image: ["https://example.com/source.png", "https://example.com/face.jpg"],
      image_size: "1K",
    }, "compiled prompt");

    expect(shouldUseImageEditEndpoint({ model: "gpt-image-2", image: ["https://example.com/source.png"] }, { name: "plato" }))
      .toBe(true);
    expect(getImageEditUrl("https://yunwu.ai/v1")).toBe("https://yunwu.ai/v1/images/edits");
    expect(body).toMatchObject({
      model: "gpt-image-2",
      prompt: "compiled prompt",
      size: "864x1536",
      quality: "high",
    });
    expect(body).not.toHaveProperty("image");
    expect(body).not.toHaveProperty("response_format");
    expect(body).not.toHaveProperty("aspect_ratio");
  });

  it("builds gpt-image-2 edits as multipart form data", async () => {
    const request = await buildImageEditRequest({
      apiBase: "https://yunwu.ai/v1",
      apiKey: "test-key",
      body: {
        model: "gpt-image-2",
        prompt: "make it premium",
        size: "2048x2048",
        quality: "high",
      },
      imageUrls: ["data:image/png;base64,aGVsbG8="],
    });

    expect(request.url).toBe("https://yunwu.ai/v1/images/edits");
    expect(request.init.headers).toMatchObject({
      Authorization: "Bearer test-key",
      Accept: "application/json",
    });
    expect(request.init.body).toBeInstanceOf(FormData);
  });

  it("rejects too many gpt-image-2 edit reference images before calling the provider", async () => {
    await expect(buildImageEditRequest({
      apiBase: "https://yunwu.ai/v1",
      apiKey: "test-key",
      body: {
        model: "gpt-image-2",
        prompt: "make it premium",
        size: "2048x2048",
        quality: "high",
      },
      imageUrls: Array.from({ length: 16 }, () => "data:image/png;base64,aGVsbG8="),
    })).rejects.toThrow("fewer than 16");
  });

  it("maps gpt-image-2 selected resolution into the documented size field", () => {
    expect(resolveGptImage2Size("1K", "1:1")).toBe("1024x1024");
    expect(resolveGptImage2Size("1K", "16:9")).toBe("1536x864");
    expect(resolveGptImage2Size("1K", "9:16")).toBe("864x1536");
    expect(resolveGptImage2Size("1K", "3:4")).toBe("1152x1536");
    expect(resolveGptImage2Size("1K", "4:5")).toBe("1216x1520");
    expect(resolveGptImage2Size("2K", "1:1")).toBe("2048x2048");
    expect(resolveGptImage2Size("2K", "16:9")).toBe("2048x1152");
    expect(resolveGptImage2Size("2K", "9:16")).toBe("1152x2048");
    expect(resolveGptImage2Size("2K", "3:4")).toBe("1536x2048");
    expect(resolveGptImage2Size("4K", "16:9")).toBe("3840x2160");
    expect(resolveGptImage2Size("4K", "9:16")).toBe("2160x3840");
    expect(resolveGptImage2Size("4K", "3:4")).toBe("2448x3264");
    expect(resolveGptImage2Size("4K", "1:1")).toBe("2880x2880");
    expect(resolveGptImage2Size("2K", "auto")).toBe("2048x2048");
    expect(resolveGptImage2Size("4K", "auto")).toBe("3840x2160");
  });

  it("falls back to the safest supported size for unknown image size values", () => {
    const body = buildGenerateRequestBody({
      model: "gpt-image-2",
      prompt: "make it premium",
      aspect_ratio: "16:9",
      image: ["https://example.com/source.png"],
      image_size: "1024x1024" as never,
    }, "compiled prompt");

    expect(body).toMatchObject({ model: "gpt-image-2", size: "1536x864", quality: "high" });
  });

  it("preserves gpt-image-2 2K and 4K selections in request bodies", () => {
    const twoK = buildGenerateRequestBody({
      model: "gpt-image-2",
      prompt: "make it premium",
      aspect_ratio: "16:9",
      image: ["https://example.com/source.png"],
      image_size: "2K",
    }, "compiled prompt");
    const fourK = buildGenerateRequestBody({
      model: "gpt-image-2",
      prompt: "make it premium",
      aspect_ratio: "16:9",
      image: ["https://example.com/source.png"],
      image_size: "4K",
    }, "compiled prompt");

    expect(twoK).toMatchObject({ model: "gpt-image-2", size: "2048x1152", quality: "high" });
    expect(fourK).toMatchObject({ model: "gpt-image-2", size: "3840x2160", quality: "high" });
    expect(twoK).not.toHaveProperty("image_size");
    expect(fourK).not.toHaveProperty("image_size");
  });

  it("does not collapse gpt-image-2 selected resolution when aspect ratio is auto", () => {
    const body = buildGenerateRequestBody({
      model: "gpt-image-2",
      prompt: "make it premium",
      aspect_ratio: "auto",
      image: ["https://example.com/source.png"],
      image_size: "4K",
    }, "compiled prompt");

    expect(body).toMatchObject({ model: "gpt-image-2", size: "3840x2160", quality: "high" });
  });

  it("keeps nano banana reference image requests on the existing JSON shape", () => {
    const body = buildGenerateRequestBody({
      model: "nano-banana-2",
      prompt: "swap the face",
      aspect_ratio: "3:4",
      image: ["https://example.com/source.png"],
      image_size: "1K",
    }, "compiled prompt");

    expect(shouldUseImageEditEndpoint({ model: "nano-banana-2", image: ["https://example.com/source.png"] }, { name: "lingya" }))
      .toBe(false);
    expect(body).toMatchObject({
      model: "nano-banana-2",
      prompt: "compiled prompt",
      response_format: "url",
      aspect_ratio: "3:4",
      image: ["https://example.com/source.png"],
      image_size: "1K",
    });
  });

  it("keeps Plato gpt-image-2 pinned to the official model id", () => {
    const previous = process.env.PLATO_GPT_IMAGE_MODEL;

    expect(resolveProviderImageModel("gpt-image-2", { name: "plato" })).toBe("gpt-image-2");

    process.env.PLATO_GPT_IMAGE_MODEL = "gpt-image-2-custom";

    expect(resolveProviderImageModel("gpt-image-2", { name: "plato" })).toBe("gpt-image-2");
    expect(resolveProviderImageModel("gpt-image-2", { name: "lingya" })).toBe("gpt-image-2");
    expect(resolveProviderImageModel("nano-banana-2", { name: "laozhang" })).toBe("gemini-3.1-flash-image-preview");
    expect(resolveProviderImageModel("nano-banana-pro", { name: "laozhang" })).toBe("gemini-3-pro-image-preview");

    if (previous === undefined) {
      delete process.env.PLATO_GPT_IMAGE_MODEL;
    } else {
      process.env.PLATO_GPT_IMAGE_MODEL = previous;
    }
  });

  it("routes deprecated Plato base URL to the default GPT image provider", () => {
    const previous = process.env.PLATO_BASE_URL;
    process.env.PLATO_BASE_URL = "https://api.bltcy.ai";

    expect(getPlatoApiBaseUrl()).toBe("https://yunwu.ai/v1");

    process.env.PLATO_BASE_URL = "https://api.example.com/proxy";
    expect(getPlatoApiBaseUrl()).toBe("https://api.example.com/proxy/v1");

    if (previous === undefined) {
      delete process.env.PLATO_BASE_URL;
    } else {
      process.env.PLATO_BASE_URL = previous;
    }
  });

  it("eases synchronous request progress while leaving room for completion", () => {
    expect(calculateImageRequestHeartbeatProgress(0, 1, 92)).toBe(2);
    expect(calculateImageRequestHeartbeatProgress(60_000, 2, 92)).toBeGreaterThanOrEqual(40);
    expect(calculateImageRequestHeartbeatProgress(5 * 60_000, 91, 92)).toBe(92);
    expect(calculateImageRequestHeartbeatProgress(5 * 60_000, 92, 92)).toBe(92);
  });
});
