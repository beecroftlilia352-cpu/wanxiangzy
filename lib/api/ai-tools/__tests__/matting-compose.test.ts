import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiToolAssetReferenceError } from "@/lib/api/ai-tools/asset-reference.server";
import { RemoteImageFetchError } from "@/lib/api/remote-image-fetch";
import { composeAiToolMattingResult } from "@/lib/api/ai-tools/matting-compose.server";

type ComposeDependencies = NonNullable<Parameters<typeof composeAiToolMattingResult>[3]>;

const OSS_ENV = {
  IMAGE_STORAGE_PROVIDER: "aliyun-oss",
  ALIYUN_OSS_ACCESS_KEY_ID: "test-key",
  ALIYUN_OSS_ACCESS_KEY_SECRET: "test-secret",
  ALIYUN_OSS_BUCKET: "test-bucket",
  ALIYUN_OSS_REGION: "oss-cn-hongkong",
  ALIYUN_OSS_PUBLIC_BASE_URL: "https://oss.example.com",
} as const;

describe("AI tool matting server composition", () => {
  const fetchImage = vi.fn();
  const store = vi.fn();
  const createMaskReference = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    store.mockImplementation(async (input: { bytes: Buffer; name: string }) => {
      const metadata = await sharp(input.bytes).metadata();
      const suffix = input.name.includes("alpha") ? "alpha" : "result";
      return {
        url: `https://oss.example.com/generated/${suffix}.png`,
        display_url: `https://oss.example.com/generated/${suffix}.png`,
        delete_url: "",
        width: metadata.width,
        height: metadata.height,
        content_type: "image/png",
        byte_size: input.bytes.length,
        object_key: `generated/${suffix}.png`,
      };
    });
    createMaskReference.mockReturnValue({
      token: "signed-alpha-ref",
      referenceUrl: "https://ai-tool-ref.invalid/mask/signed-alpha-ref",
      url: "https://oss.example.com/generated/alpha.png",
      objectKey: "generated/alpha.png",
      width: 2,
      height: 2,
      contentType: "image/png",
      expiresAt: "2026-08-17T13:30:00.000Z",
    });
  });

  it("adds an editor brush mask, composes real alpha, and stores result plus reusable alpha", async () => {
    const source = await createSourcePng(2, 2);
    const base = await createGreyscalePng(2, 2, [255, 0, 0, 0]);
    const edit = await createGreyscalePng(2, 2, [0, 255, 0, 0]);
    fetchImage.mockImplementation(async (url: string) => ({
      bytes: url.includes("source") ? source : url.includes("base") ? base : edit,
      url,
      contentType: "image/png",
    }));

    const result = await composeAiToolMattingResult({
      request_id: "request-1234",
      source_url: "https://assets.example.com/source.png",
      base_mask_url: "https://provider.example.com/base.png",
      base_mask_kind: "mask",
      edit_mask_url: "https://assets.example.com/edit.png",
      edit_operation: "add",
    }, { userId: "user-1" }, OSS_ENV, dependencies(fetchImage, store, createMaskReference));

    expect(result.result_urls).toEqual(["https://oss.example.com/generated/result.png"]);
    expect(result.outputs).toEqual([
      {
        url: "https://oss.example.com/generated/result.png",
        role: "result",
        kind: "image",
        mime_type: "image/png",
        dimensions: { width: 2, height: 2 },
      },
      {
        url: "https://oss.example.com/generated/alpha.png",
        role: "alpha",
        kind: "alpha",
        mime_type: "image/png",
        dimensions: { width: 2, height: 2 },
      },
    ]);
    expect(result.mask).toEqual({
      url: "https://ai-tool-ref.invalid/mask/signed-alpha-ref",
      ref: "signed-alpha-ref",
      width: 2,
      height: 2,
      content_type: "image/png",
      expires_at: "2026-08-17T13:30:00.000Z",
    });
    expect(result.mask).not.toHaveProperty("object_key");
    expect(createMaskReference).toHaveBeenCalledWith({
      userId: "user-1",
      url: "https://oss.example.com/generated/alpha.png",
      objectKey: "generated/alpha.png",
      width: 2,
      height: 2,
      contentType: "image/png",
    });
    expect(fetchImage).toHaveBeenCalledTimes(3);
    expect(fetchImage.mock.calls[0][1]).toMatchObject({
      allowedContentTypes: ["image"],
      maxRedirects: 2,
      timeoutMs: 20_000,
    });
    expect(store).toHaveBeenCalledTimes(2);
    expect(store.mock.calls.map(([input]) => input.storageClass)).toEqual(["generated", "generated"]);

    const resultBytes = store.mock.calls[0][0].bytes as Buffer;
    const resultPixels = await sharp(resultBytes).ensureAlpha().raw().toBuffer();
    expect(readAlpha(resultPixels)).toEqual([255, 255, 0, 0]);

    const alphaBytes = store.mock.calls[1][0].bytes as Buffer;
    const alphaMetadata = await sharp(alphaBytes).metadata();
    expect(alphaMetadata.hasAlpha).toBe(true);
    const alphaPixels = await sharp(alphaBytes).extractChannel("alpha").raw().toBuffer();
    expect([...alphaPixels]).toEqual([255, 255, 0, 0]);
  });

  it("extracts an actual alpha channel and applies a subtractive brush", async () => {
    const source = await createSourcePng(2, 1);
    const baseAlpha = await createAlphaPng(2, 1, [255, 128]);
    const edit = await createGreyscalePng(2, 1, [255, 128]);
    fetchImage.mockImplementation(async (url: string) => ({
      bytes: url.includes("source") ? source : url.includes("base") ? baseAlpha : edit,
      url,
      contentType: "image/png",
    }));

    await composeAiToolMattingResult({
      request_id: "request-5678",
      source_url: "https://assets.example.com/source.png",
      base_mask_url: "https://provider.example.com/base.png",
      base_mask_kind: "alpha",
      edit_mask_url: "https://assets.example.com/edit.png",
      edit_operation: "subtract",
    }, { userId: "user-1" }, OSS_ENV, dependencies(fetchImage, store, createMaskReference));

    const resultPixels = await sharp(store.mock.calls[0][0].bytes).ensureAlpha().raw().toBuffer();
    expect(readAlpha(resultPixels)).toEqual([0, 64]);
  });

  it("fails closed when the generated alpha cannot be signed", async () => {
    const source = await createSourcePng(2, 1);
    const base = await createGreyscalePng(2, 1, [255, 128]);
    fetchImage.mockImplementation(async (url: string) => ({
      bytes: url.includes("source") ? source : base,
      url,
      contentType: "image/png",
    }));
    createMaskReference.mockImplementationOnce(() => {
      throw new AiToolAssetReferenceError("AI 工具资产引用签名尚未配置", {
        code: "AI_TOOL_ASSET_REFERENCE_NOT_CONFIGURED",
        status: 503,
      });
    });

    await expect(composeAiToolMattingResult({
      request_id: "request-1234",
      source_url: "https://assets.example.com/source.png",
      base_mask_url: "https://provider.example.com/base.png",
      base_mask_kind: "mask",
    }, { userId: "user-1" }, OSS_ENV, dependencies(fetchImage, store, createMaskReference)))
      .rejects.toMatchObject({
        code: "AI_TOOL_ASSET_REFERENCE_NOT_CONFIGURED",
        status: 503,
        retryable: false,
      });
  });

  it("rejects masks whose decoded dimensions differ from the oriented source", async () => {
    const source = await createSourcePng(2, 2);
    const base = await createGreyscalePng(3, 2, [255, 0, 0, 0, 0, 0]);
    fetchImage.mockResolvedValueOnce({ bytes: source, url: "https://assets.example/source.png", contentType: "image/png" });
    fetchImage.mockResolvedValueOnce({ bytes: base, url: "https://assets.example/base.png", contentType: "image/png" });

    await expect(composeAiToolMattingResult({
      request_id: "request-1234",
      source_url: "https://assets.example.com/source.png",
      base_mask_url: "https://provider.example.com/base.png",
      base_mask_kind: "mask",
    }, { userId: "user-1" }, OSS_ENV, dependencies(fetchImage, store, createMaskReference))).rejects.toMatchObject({
      code: "AI_TOOL_MATTING_DIMENSIONS_MISMATCH",
      status: 400,
    });
    expect(store).not.toHaveBeenCalled();
  });

  it("fails closed before fetching when generated OSS is not fully configured", async () => {
    await expect(composeAiToolMattingResult({
      request_id: "request-1234",
      source_url: "https://assets.example.com/source.png",
      base_mask_url: "https://provider.example.com/base.png",
      base_mask_kind: "mask",
    }, { userId: "user-1" }, {
      ...OSS_ENV,
      ALIYUN_OSS_ACCESS_KEY_SECRET: "",
    }, dependencies(fetchImage, store, createMaskReference))).rejects.toMatchObject({
      code: "AI_TOOL_MATTING_STORAGE_NOT_CONFIGURED",
      status: 503,
      retryable: false,
    });
    expect(fetchImage).not.toHaveBeenCalled();
  });

  it("maps guarded remote fetch rejections without decoding or storing", async () => {
    fetchImage.mockRejectedValue(new RemoteImageFetchError(
      "private address",
      "blocked-address",
    ));

    await expect(composeAiToolMattingResult({
      request_id: "request-1234",
      source_url: "https://assets.example.com/source.png",
      base_mask_url: "https://provider.example.com/base.png",
      base_mask_kind: "mask",
    }, { userId: "user-1" }, OSS_ENV, dependencies(fetchImage, store, createMaskReference))).rejects.toMatchObject({
      code: "AI_TOOL_MATTING_REMOTE_URL_BLOCKED",
      status: 400,
      retryable: false,
    });
    expect(store).not.toHaveBeenCalled();
  });
});

function dependencies(
  remoteFetcher: ComposeDependencies["fetchImage"],
  storageWriter: ComposeDependencies["store"],
  referenceCreator: ComposeDependencies["createMaskReference"],
): ComposeDependencies {
  return {
    fetchImage: remoteFetcher,
    getStorageProvider: () => "aliyun-oss",
    store: storageWriter,
    createMaskReference: referenceCreator,
  };
}

async function createSourcePng(width: number, height: number) {
  return sharp({
    create: { width, height, channels: 3, background: { r: 220, g: 80, b: 40 } },
  }).png().toBuffer();
}

async function createGreyscalePng(width: number, height: number, values: number[]) {
  return sharp(Buffer.from(values), { raw: { width, height, channels: 1 } }).png().toBuffer();
}

async function createAlphaPng(width: number, height: number, alpha: number[]) {
  const white = Buffer.alloc(width * height, 255);
  return sharp(white, { raw: { width, height, channels: 1 } })
    .joinChannel(Buffer.from(alpha), { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();
}

function readAlpha(rgba: Buffer) {
  const alpha: number[] = [];
  for (let index = 3; index < rgba.length; index += 4) alpha.push(rgba[index]!);
  return alpha;
}
