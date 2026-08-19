import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { AiToolOutput, AiToolSubmitResult } from "@/lib/ai-tools/types";

const mocks = vi.hoisted(() => ({
  fetchRemoteImageBuffer: vi.fn(),
  claimAiToolOutputPersistence: vi.fn(),
  completeAiToolOutputPersistence: vi.fn(),
  failAiToolOutputPersistence: vi.fn(),
}));

vi.mock("@/lib/api/remote-image-fetch", () => ({
  fetchRemoteImageBuffer: mocks.fetchRemoteImageBuffer,
}));

vi.mock("@/lib/api/ai-tools/task-repository.server", () => ({
  AiToolTaskRepositoryError: class AiToolTaskRepositoryError extends Error {},
  claimAiToolOutputPersistence: mocks.claimAiToolOutputPersistence,
  completeAiToolOutputPersistence: mocks.completeAiToolOutputPersistence,
  failAiToolOutputPersistence: mocks.failAiToolOutputPersistence,
}));

import { persistCompletedAiToolOutputs } from "@/lib/api/ai-tools/output-storage.server";

const ENV_KEYS = [
  "IMAGE_STORAGE_PROVIDER",
  "ALIYUN_OSS_ACCESS_KEY_ID",
  "ALIYUN_OSS_ACCESS_KEY_SECRET",
  "ALIYUN_OSS_BUCKET",
  "ALIYUN_OSS_REGION",
  "ALIYUN_OSS_PUBLIC_BASE_URL",
  "ALIYUN_OSS_PREFIX",
  "ALIYUN_OSS_GENERATED_PREFIX",
  "ALIYUN_OSS_TEMP_PREFIX",
] as const;

describe("AI tool completed output storage", () => {
  const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.claimAiToolOutputPersistence.mockResolvedValue({ state: "claimed", leaseToken: "lease-1" });
    mocks.completeAiToolOutputPersistence.mockResolvedValue(undefined);
    mocks.failAiToolOutputPersistence.mockResolvedValue(undefined);
    configureOss();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    for (const key of ENV_KEYS) restoreEnv(key, originalEnv[key]);
  });

  it("decodes outputs and stores results under generated while keeping mask and alpha temporary", async () => {
    const resultBytes = await imageBytes(12, 8, "jpeg");
    const maskBytes = await imageBytes(12, 8, "png");
    const alphaBytes = await imageBytes(12, 8, "png", true);
    const bytesByUrl = new Map([
      ["https://provider.example/result.jpg", resultBytes],
      ["https://provider.example/mask.png", maskBytes],
      ["https://provider.example/alpha.png", alphaBytes],
    ]);
    mocks.fetchRemoteImageBuffer.mockImplementation(async (url: string) => ({
      bytes: bytesByUrl.get(url),
      contentType: url.endsWith(".jpg") ? "image/jpeg" : "image/png",
      url,
    }));
    const puts: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      expect(init?.method).toBe("PUT");
      puts.push(url);
      return new Response("", { status: 200 });
    }));

    const persisted = await persistCompletedAiToolOutputs(taskResult([
      output("https://provider.example/result.jpg", "result", "image", "image/jpeg", 12, 8),
      output("https://provider.example/mask.png", "mask", "mask", "image/png", 12, 8),
      output("https://provider.example/alpha.png", "alpha", "alpha", "image/png", 12, 8),
    ]), persistenceContext());

    expect(persisted.outputs).toEqual([
      expect.objectContaining({
        url: expect.stringContaining("/generated-results/original/"),
        mime_type: "image/jpeg",
        dimensions: { width: 12, height: 8 },
      }),
      expect.objectContaining({
        url: expect.stringContaining("/temp/original/"),
        mime_type: "image/png",
        dimensions: { width: 12, height: 8 },
      }),
      expect.objectContaining({
        url: expect.stringContaining("/temp/original/"),
        mime_type: "image/png",
        dimensions: { width: 12, height: 8 },
      }),
    ]);
    expect(persisted.result_urls).toEqual([persisted.outputs[0].url]);
    expect(puts).toHaveLength(3);
    expect(puts[0]).toContain("/generated-results/original/");
    expect(puts[1]).toContain("/temp/original/");
    expect(puts[2]).toContain("/temp/original/");
  });

  it("fails closed instead of returning a provider URL when OSS storage fails", async () => {
    const bytes = await imageBytes(5, 4, "png");
    mocks.fetchRemoteImageBuffer.mockResolvedValue({
      bytes,
      contentType: "image/png",
      url: "https://provider.example/result.png",
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response("failed", { status: 503 })));

    await expect(persistCompletedAiToolOutputs(taskResult([
      output("https://provider.example/result.png", "result", "image", "image/png", 5, 4),
    ]), persistenceContext())).rejects.toMatchObject({
      code: "AI_TOOL_OUTPUT_STORE_FAILED",
      status: 502,
      retryable: true,
    });
  });

  it("rejects auxiliary output dimensions that do not match the result", async () => {
    const resultBytes = await imageBytes(10, 8, "png");
    const maskBytes = await imageBytes(9, 8, "png");
    mocks.fetchRemoteImageBuffer.mockImplementation(async (url: string) => ({
      bytes: url.includes("mask") ? maskBytes : resultBytes,
      contentType: "image/png",
      url,
    }));
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 200 })));

    await expect(persistCompletedAiToolOutputs(taskResult([
      output("https://provider.example/result.png", "result", "image", "image/png", 10, 8),
      output("https://provider.example/mask.png", "mask", "mask", "image/png", 9, 8),
    ]), persistenceContext())).rejects.toMatchObject({
      code: "AI_TOOL_OUTPUT_DIMENSIONS_MISMATCH",
      retryable: false,
    });
  });

  it("rejects non-PNG masks and alpha assets without a safe alpha format", async () => {
    const resultBytes = await imageBytes(6, 6, "png");
    const jpegBytes = await imageBytes(6, 6, "jpeg");
    mocks.fetchRemoteImageBuffer.mockImplementation(async (url: string) => ({
      bytes: url.endsWith(".jpg") ? jpegBytes : resultBytes,
      contentType: url.endsWith(".jpg") ? "image/jpeg" : "image/png",
      url,
    }));
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 200 })));

    await expect(persistCompletedAiToolOutputs(taskResult([
      output("https://provider.example/result.png", "result", "image", "image/png", 6, 6),
      output("https://provider.example/mask.jpg", "mask", "mask", "image/jpeg", 6, 6),
    ]), persistenceContext())).rejects.toMatchObject({ code: "AI_TOOL_OUTPUT_INVALID" });
  });

  it("rejects declared pixel counts above 32 million before fetching", async () => {
    await expect(persistCompletedAiToolOutputs(taskResult([
      output("https://provider.example/result.png", "result", "image", "image/png", 8_000, 4_001),
    ]), persistenceContext())).rejects.toMatchObject({
      code: "AI_TOOL_OUTPUT_PIXELS_EXCEEDED",
      status: 413,
    });
    expect(mocks.fetchRemoteImageBuffer).not.toHaveBeenCalled();
  });

  it("rejects PNG outputs carrying an animation control chunk", async () => {
    const png = await imageBytes(4, 4, "png");
    mocks.fetchRemoteImageBuffer.mockResolvedValue({
      bytes: addAnimationControlChunk(png),
      contentType: "image/png",
      url: "https://provider.example/result.png",
    });

    await expect(persistCompletedAiToolOutputs(taskResult([
      output("https://provider.example/result.png", "result", "image", "image/png", 4, 4),
    ]), persistenceContext())).rejects.toMatchObject({
      code: "AI_TOOL_OUTPUT_INVALID",
      retryable: false,
    });
  });

  it("validates but does not duplicate a clean URL already in the expected generated prefix", async () => {
    const url = "https://bucket.oss-cn-hongkong.aliyuncs.com/generated-results/original/2026/result-c6c289e49e9c.png";
    const bytes = await imageBytes(3, 2, "png");
    mocks.fetchRemoteImageBuffer.mockResolvedValue({ bytes, contentType: "image/png", url });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const persisted = await persistCompletedAiToolOutputs(taskResult([
      output(url, "result", "image", "image/png", 3, 2),
    ]), persistenceContext());

    expect(persisted.result_urls).toEqual([url]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.fetchRemoteImageBuffer).toHaveBeenCalledOnce();
  });

  it("normalizes model output size and recomposes it over the canonical source outside the selected mask", async () => {
    const source = await sharp({ create: { width: 4, height: 2, channels: 3, background: "#ff0000" } }).png().toBuffer();
    const generated = await sharp({ create: { width: 2, height: 1, channels: 3, background: "#0000ff" } }).png().toBuffer();
    const mask = await sharp(Buffer.from([
      0, 0, 255, 255,
      0, 0, 255, 255,
    ]), { raw: { width: 4, height: 2, channels: 1 } }).png().toBuffer();
    const bytesByUrl = new Map([
      ["https://assets.example/source.png", source],
      ["https://assets.example/mask.png", mask],
      ["https://provider.example/result.png", generated],
    ]);
    mocks.fetchRemoteImageBuffer.mockImplementation(async (url: string) => ({
      bytes: bytesByUrl.get(url),
      contentType: "image/png",
      url,
    }));
    let storedBytes: Buffer | null = null;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      storedBytes = Buffer.from(init?.body as Uint8Array);
      return new Response("", { status: 200 });
    }));
    const baseContext = persistenceContext();
    const context = {
      ...baseContext,
      task: {
        ...baseContext.task,
        provider: "generative-image-edit" as const,
        operation: "erase" as const,
        requestPayload: {
          request_id: "request-output-1234",
          operation: "erase" as const,
          source_url: "https://assets.example/source.png",
          mask_url: "https://assets.example/mask.png",
          reference_urls: [],
          options: {
            mask_feather: 8,
            output_format: "png" as const,
            quality: "standard" as const,
          },
        },
      },
    };
    const result = {
      ...taskResult([output("https://provider.example/result.png", "result", "image", "image/png", 2, 1)]),
      operation: "erase" as const,
      provider: "generative-image-edit" as const,
      capability: "inpaint" as const,
    };

    const persisted = await persistCompletedAiToolOutputs(result, context);

    expect(persisted.outputs[0].mime_type).toBe("image/png");
    const pixels = await sharp(storedBytes!).removeAlpha().raw().toBuffer();
    expect([...pixels.subarray(0, 3)]).toEqual([255, 0, 0]);
    expect([...pixels.subarray(2 * 3, 3 * 3)]).toEqual([0, 0, 255]);
  });

  it("normalizes the generated canvas and recomposes the transformed canonical source into the outpaint result", async () => {
    const source = await sharp({ create: { width: 2, height: 2, channels: 3, background: "#ff0000" } }).png().toBuffer();
    const generated = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#0000ff" } }).png().toBuffer();
    const bytesByUrl = new Map([
      ["https://assets.example/source.png", source],
      ["https://provider.example/result.png", generated],
    ]);
    mocks.fetchRemoteImageBuffer.mockImplementation(async (url: string) => ({
      bytes: bytesByUrl.get(url),
      contentType: "image/png",
      url,
    }));
    let storedBytes: Buffer | null = null;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      storedBytes = Buffer.from(init?.body as Uint8Array);
      return new Response("", { status: 200 });
    }));
    const baseContext = persistenceContext();
    const context = {
      ...baseContext,
      task: {
        ...baseContext.task,
        provider: "generative-image-edit" as const,
        operation: "outpaint" as const,
        requestPayload: {
          request_id: "request-output-1234",
          operation: "outpaint" as const,
          source_url: "https://assets.example/source.png",
          reference_urls: [],
          options: {
            target_width: 4,
            target_height: 4,
            anchor: "center" as const,
            position_x: 0.5,
            position_y: 0.5,
            source_scale: 1,
            mask_feather: 8,
            output_format: "png" as const,
          },
        },
      },
    };
    const result = {
      ...taskResult([output("https://provider.example/result.png", "result", "image", "image/png", 8, 8)]),
      operation: "outpaint" as const,
      provider: "generative-image-edit" as const,
      capability: "outpaint" as const,
    };

    await persistCompletedAiToolOutputs(result, context);

    const pixels = await sharp(storedBytes!).removeAlpha().raw().toBuffer();
    expect([...pixels.subarray(0, 3)]).toEqual([0, 0, 255]);
    expect([...pixels.subarray((1 * 4 + 1) * 3, (1 * 4 + 2) * 3)]).toEqual([255, 0, 0]);
  });

  it("leaves development mock results unchanged without requiring OSS", async () => {
    delete process.env.IMAGE_STORAGE_PROVIDER;
    const result = { ...taskResult([
      output("https://provider.example/source.png", "result", "image", "image/png", 3, 2),
    ]), execution_mode: "mock" as const };

    await expect(persistCompletedAiToolOutputs(result, { userId: "user-1" })).resolves.toBe(result);
    expect(mocks.fetchRemoteImageBuffer).not.toHaveBeenCalled();
  });

  it("reuses the database-persisted completed response without fetching or uploading again", async () => {
    const provider = taskResult([
      output("https://provider.example/result.png", "result", "image", "image/png", 3, 2),
    ]);
    const persisted = {
      ...provider,
      result_urls: ["https://bucket.oss-cn-hongkong.aliyuncs.com/generated-results/original/result.png"],
      outputs: [{
        ...provider.outputs[0],
        url: "https://bucket.oss-cn-hongkong.aliyuncs.com/generated-results/original/result.png",
      }],
    };
    mocks.claimAiToolOutputPersistence.mockResolvedValue({ state: "cached", result: persisted });

    await expect(persistCompletedAiToolOutputs(provider, persistenceContext())).resolves.toEqual(persisted);
    expect(mocks.fetchRemoteImageBuffer).not.toHaveBeenCalled();
    expect(mocks.completeAiToolOutputPersistence).not.toHaveBeenCalled();
  });
});

function taskResult(outputs: AiToolOutput[]): AiToolSubmitResult {
  return {
    task_id: "task-output-1234",
    request_id: "request-output-1234",
    operation: "matting",
    status: "completed",
    stage: "completed",
    progress: 100,
    expected_count: 1,
    result_urls: outputs.filter((item) => item.role === "result").map((item) => item.url),
    outputs,
    warnings: [],
    error: null,
    execution_mode: "live",
    provider: "aliyun-segmentation",
    capability: "segment",
  };
}

function output(
  url: string,
  role: AiToolOutput["role"],
  kind: AiToolOutput["kind"],
  mimeType: NonNullable<AiToolOutput["mime_type"]>,
  width: number,
  height: number,
): AiToolOutput {
  return { url, role, kind, mime_type: mimeType, dimensions: { width, height } };
}

async function imageBytes(width: number, height: number, format: "jpeg" | "png", alpha = false) {
  const image = sharp({
    create: {
      width,
      height,
      channels: alpha ? 4 : 3,
      background: alpha
        ? { r: 255, g: 255, b: 255, alpha: 0.5 }
        : { r: 255, g: 255, b: 255 },
    },
  });
  return format === "jpeg" ? image.jpeg().toBuffer() : image.png().toBuffer();
}

function addAnimationControlChunk(png: Buffer) {
  const chunk = Buffer.alloc(20);
  chunk.writeUInt32BE(8, 0);
  chunk.write("acTL", 4, "ascii");
  chunk.writeUInt32BE(2, 8);
  chunk.writeUInt32BE(0, 12);
  return Buffer.concat([png.subarray(0, 33), chunk, png.subarray(33)]);
}

function configureOss() {
  process.env.IMAGE_STORAGE_PROVIDER = "aliyun-oss";
  process.env.ALIYUN_OSS_ACCESS_KEY_ID = "test-access-key";
  process.env.ALIYUN_OSS_ACCESS_KEY_SECRET = "test-secret";
  process.env.ALIYUN_OSS_BUCKET = "bucket";
  process.env.ALIYUN_OSS_REGION = "oss-cn-hongkong";
  process.env.ALIYUN_OSS_PUBLIC_BASE_URL = "https://bucket.oss-cn-hongkong.aliyuncs.com";
  process.env.ALIYUN_OSS_GENERATED_PREFIX = "generated-results/original";
  process.env.ALIYUN_OSS_TEMP_PREFIX = "temp/original";
}

function persistenceContext() {
  return {
    userId: "user-1",
    task: {
      id: "00000000-0000-4000-8000-000000000001",
      userId: "user-1",
      requestId: "request-output-1234",
      provider: "aliyun-segmentation" as const,
      providerTaskId: "task-output-1234",
      operation: "matting" as const,
      requestFingerprint: "a".repeat(64),
      sourceAssetId: null,
      sourceUrl: "https://assets.example/source.png",
      sourceWidth: 3,
      sourceHeight: 2,
      sourceOwnership: {},
      requestPayload: null,
      status: "completed" as const,
      providerPayload: {},
      outputs: [],
      resultUrls: [],
      responsePayload: {},
      outputSignature: null,
      outputPersistenceStatus: "pending" as const,
      submissionLeaseToken: null,
      submissionLeaseExpiresAt: null,
      outputLeaseToken: null,
      outputLeaseExpiresAt: null,
      generationId: null,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    },
  };
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
