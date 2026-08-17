import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { AiToolCreateRequestFor } from "@/lib/ai-tools/types";
import { getAiToolProviderStatus } from "@/lib/api/ai-tools/provider.server";
import { executeLocalResizeTask } from "@/lib/api/ai-tools/resize.server";
import type { StoreImageInput, StoreImageOptions, StoredImage } from "@/lib/api/image-storage";

const OSS_ENV = {
  NODE_ENV: "production",
  AI_TOOLS_EXECUTION_MODE: "live",
  IMAGE_STORAGE_PROVIDER: "aliyun-oss",
  ALIYUN_OSS_ACCESS_KEY_ID: "access-key",
  ALIYUN_OSS_ACCESS_KEY_SECRET: "access-secret",
  ALIYUN_OSS_BUCKET: "bucket",
  ALIYUN_OSS_REGION: "oss-cn-hangzhou",
  ALIYUN_OSS_PUBLIC_BASE_URL: "https://oss.example.com",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
} as const;

describe("local Sharp resize provider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is available with complete OSS configuration and no AI gateway", () => {
    expect(getAiToolProviderStatus("resize", OSS_ENV)).toMatchObject({
      provider: "sharp",
      capability: "resize",
      available: true,
      configured: true,
      execution_mode: "live",
      mock: false,
      reason: "READY",
    });
    expect(getAiToolProviderStatus("resize", {
      ...OSS_ENV,
      ALIYUN_OSS_ACCESS_KEY_SECRET: "",
    })).toMatchObject({
      available: false,
      configured: false,
      reason: "NOT_CONFIGURED",
    });
  });

  it("contains the source on the requested background and writes generated OSS", async () => {
    const source = await solidImage(4, 2, { r: 255, g: 0, b: 0 });
    const harness = createHarness(source);
    const result = await executeLocalResizeTask(resizeRequest({
      width: 4,
      height: 4,
      fit: "contain",
      background_color: "#00ff00",
    }), { userId: "user-1" }, harness.dependencies);

    expect(result).toMatchObject({
      operation: "resize",
      status: "completed",
      stage: "local_resize_completed",
      execution_mode: "live",
      provider: "sharp",
      result_urls: ["https://oss.example.com/generated/result.png"],
      outputs: [{
        mime_type: "image/png",
        dimensions: { width: 4, height: 4 },
      }],
    });
    expect(harness.storedInput?.storageClass).toBe("generated");
    expect(harness.storedOptions).toMatchObject({ preservePixelDimensions: true });
    const pixels = await sharp(harness.storedInput!.bytes!).ensureAlpha().raw().toBuffer();
    expect(pixelAt(pixels, 4, 0, 0)).toEqual([0, 255, 0, 255]);
    expect(pixelAt(pixels, 4, 1, 1)).toEqual([255, 0, 0, 255]);
  });

  it("uses the shared normalized cover position for left and right crops", async () => {
    const source = await twoToneLandscape();
    const left = createHarness(source);
    await executeLocalResizeTask(resizeRequest({
      width: 2,
      height: 2,
      fit: "cover",
      position_x: 0,
    }), { userId: "user-1" }, left.dependencies);
    const leftPixels = await sharp(left.storedInput!.bytes!).removeAlpha().raw().toBuffer();
    expect(pixelAt(leftPixels, 2, 0, 0, 3)).toEqual([255, 0, 0]);

    const right = createHarness(source);
    await executeLocalResizeTask(resizeRequest({
      width: 2,
      height: 2,
      fit: "cover",
      position_x: 1,
    }), { userId: "user-1" }, right.dependencies);
    const rightPixels = await sharp(right.storedInput!.bytes!).removeAlpha().raw().toBuffer();
    expect(pixelAt(rightPixels, 2, 0, 0, 3)).toEqual([0, 0, 255]);
  });

  it("uses the explicit source-space crop selected in the canvas editor", async () => {
    const source = await twoToneLandscape();
    const harness = createHarness(source);
    await executeLocalResizeTask(resizeRequest({
      width: 2,
      height: 2,
      fit: "cover",
      crop_x: 2,
      crop_y: 0,
      crop_width: 2,
      crop_height: 2,
    }), { userId: "user-1" }, harness.dependencies);
    const pixels = await sharp(harness.storedInput!.bytes!).removeAlpha().raw().toBuffer();
    expect(pixelAt(pixels, 2, 0, 0, 3)).toEqual([0, 0, 255]);
  });

  it("supports deterministic fill encoding and without-enlargement", async () => {
    const source = await solidImage(2, 2, { r: 10, g: 20, b: 30 });
    const fill = createHarness(source);
    const filled = await executeLocalResizeTask(resizeRequest({
      width: 3,
      height: 4,
      fit: "fill",
      output_format: "webp",
      quality: 77,
    }), { userId: "user-1" }, fill.dependencies);
    expect(filled.outputs[0]).toMatchObject({
      mime_type: "image/webp",
      dimensions: { width: 3, height: 4 },
    });
    await expect(sharp(fill.storedInput!.bytes!).metadata()).resolves.toMatchObject({
      format: "webp",
      width: 3,
      height: 4,
    });

    const noEnlarge = createHarness(source);
    const preserved = await executeLocalResizeTask(resizeRequest({
      width: 4,
      height: 4,
      fit: "cover",
      without_enlargement: true,
    }), { userId: "user-1" }, noEnlarge.dependencies);
    expect(preserved.outputs[0].dimensions).toEqual({ width: 2, height: 2 });
  });

  it("rejects multi-frame and over-32MP sources before processing", async () => {
    const animated = await animatedGif();
    const animatedHarness = createHarness(animated, "image/gif");
    await expect(executeLocalResizeTask(
      resizeRequest({ width: 2, height: 2 }),
      { userId: "user-1" },
      animatedHarness.dependencies,
    )).rejects.toMatchObject({
      code: "AI_TOOL_RESIZE_SOURCE_ANIMATED",
      status: 400,
      retryable: false,
    });

    const pixelBomb = Buffer.from('<svg width="8000" height="8000" xmlns="http://www.w3.org/2000/svg"></svg>');
    const bombHarness = createHarness(pixelBomb, "image/svg+xml");
    await expect(executeLocalResizeTask(
      resizeRequest({ width: 2, height: 2 }),
      { userId: "user-1" },
      bombHarness.dependencies,
    )).rejects.toMatchObject({
      code: "AI_TOOL_RESIZE_SOURCE_PIXELS_EXCEEDED",
      status: 413,
      retryable: false,
    });
  });

  it("fails closed for non-canonical inputs and invalid storage responses", async () => {
    const source = await solidImage(2, 2, { r: 0, g: 0, b: 0 });
    const fetchSource = vi.fn();
    await expect(executeLocalResizeTask(resizeRequest(), { userId: "user-1" }, {
      getStorageAdapter: () => ({ provider: "aliyun-oss", isStableUrl: () => false }),
      fetchSource,
    })).rejects.toMatchObject({ code: "AI_TOOL_RESIZE_SOURCE_NOT_CANONICAL", status: 400 });
    expect(fetchSource).not.toHaveBeenCalled();

    const invalidStore = createHarness(source, "image/png", {
      object_key: undefined,
    });
    await expect(executeLocalResizeTask(
      resizeRequest(),
      { userId: "user-1" },
      invalidStore.dependencies,
    )).rejects.toMatchObject({ code: "AI_TOOL_RESIZE_STORE_INVALID", status: 502 });
  });
});

function resizeRequest(
  options: Partial<AiToolCreateRequestFor<"resize">["options"]> = {},
): AiToolCreateRequestFor<"resize"> {
  return {
    request_id: "request-1234",
    operation: "resize",
    source_url: "https://oss.example.com/uploads/source.png",
    reference_urls: [],
    options: {
      width: 4,
      height: 4,
      fit: "contain",
      position_x: 0.5,
      position_y: 0.5,
      output_format: "png",
      quality: 92,
      without_enlargement: false,
      ...options,
    },
  };
}

function createHarness(
  source: Buffer,
  sourceContentType = "image/png",
  storedOverrides: Partial<StoredImage> = {},
) {
  let storedInput: StoreImageInput | undefined;
  let storedOptions: StoreImageOptions | undefined;
  const storeOutput = vi.fn(async (input: StoreImageInput, options?: StoreImageOptions) => {
    storedInput = input;
    storedOptions = options;
    const metadata = await sharp(input.bytes!).metadata();
    return {
      url: "https://oss.example.com/generated/result.png",
      display_url: "https://oss.example.com/generated/result.png",
      delete_url: "",
      width: metadata.width || 0,
      height: metadata.height || 0,
      content_type: input.contentType,
      byte_size: input.bytes!.length,
      object_key: "generated/result.png",
      ...storedOverrides,
    } satisfies StoredImage;
  });
  return {
    get storedInput() { return storedInput; },
    get storedOptions() { return storedOptions; },
    dependencies: {
      getStorageAdapter: () => ({
        provider: "aliyun-oss" as const,
        isStableUrl: (url: string) => url.startsWith("https://oss.example.com/"),
      }),
      fetchSource: vi.fn(async () => ({
        bytes: source,
        url: "https://oss.example.com/uploads/source.png",
        contentType: sourceContentType,
      })),
      storeOutput,
    },
  };
}

async function solidImage(width: number, height: number, background: { r: number; g: number; b: number }) {
  return sharp({ create: { width, height, channels: 3, background } }).png().toBuffer();
}

async function twoToneLandscape() {
  const pixels = Buffer.from([
    255, 0, 0, 255, 0, 0, 0, 0, 255, 0, 0, 255,
    255, 0, 0, 255, 0, 0, 0, 0, 255, 0, 0, 255,
  ]);
  return sharp(pixels, { raw: { width: 4, height: 2, channels: 3 } }).png().toBuffer();
}

async function animatedGif() {
  const pixels = Buffer.alloc(2 * 4 * 3, 255);
  pixels.fill(0, 2 * 2 * 3);
  return sharp(pixels, {
    raw: { width: 2, height: 4, channels: 3, pageHeight: 2 },
  }).gif({ delay: [100, 100], loop: 0 }).toBuffer();
}

function pixelAt(
  pixels: Buffer,
  width: number,
  x: number,
  y: number,
  channels = 4,
) {
  const offset = (y * width + x) * channels;
  return [...pixels.subarray(offset, offset + channels)];
}
