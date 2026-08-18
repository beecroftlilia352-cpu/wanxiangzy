import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getImageStorageAdapter, isStableStoredImageUrl, storeImage } from "../image-storage";
import { persistGeneratedImageUrls } from "../result-image-storage";

describe("result image storage", () => {
  const originalKey = process.env.IMGBB_API_KEY;
  const originalStorageProvider = process.env.IMAGE_STORAGE_PROVIDER;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalOssAccessKeyId = process.env.ALIYUN_OSS_ACCESS_KEY_ID;
  const originalOssAccessKeySecret = process.env.ALIYUN_OSS_ACCESS_KEY_SECRET;
  const originalOssBucket = process.env.ALIYUN_OSS_BUCKET;
  const originalOssRegion = process.env.ALIYUN_OSS_REGION;
  const originalOssPublicBaseUrl = process.env.ALIYUN_OSS_PUBLIC_BASE_URL;
  const originalOssPrefix = process.env.ALIYUN_OSS_PREFIX;
  const originalOssUploadPrefix = process.env.ALIYUN_OSS_UPLOAD_PREFIX;
  const originalOssGeneratedPrefix = process.env.ALIYUN_OSS_GENERATED_PREFIX;
  const originalOssFavoritePrefix = process.env.ALIYUN_OSS_FAVORITE_PREFIX;
  const originalOssSiteAssetPrefix = process.env.ALIYUN_OSS_SITE_ASSET_PREFIX;
  const originalOssTempPrefix = process.env.ALIYUN_OSS_TEMP_PREFIX;
  const tinyAvifBase64 = "AAAAHGZ0eXBhdmlmAAAAAG1pZjFhdmlmbWlhZgAAANZtZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAAA5waXRtAAAAAAABAAAAImlsb2MAAAAAREAAAQABAAAAAAD6AAEAAAAAAAAAHgAAACNpaW5mAAAAAAABAAAAFWluZmUCAAAAAAEAAGF2MDEAAAAAVmlwcnAAAAA4aXBjbwAAAAxhdjFDgSACAAAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAABZpcG1hAAAAAAAAAAEAAQOBAgMAAAAmbWRhdBIACgc4ADYQENBpMhEWQAYYYYQAAHlM2KcgXkzU8A==";

  beforeEach(() => {
    process.env.IMAGE_STORAGE_PROVIDER = "imgbb";
    process.env.IMGBB_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    if (originalKey === undefined) {
      delete process.env.IMGBB_API_KEY;
    } else {
      process.env.IMGBB_API_KEY = originalKey;
    }
    restoreEnv("IMAGE_STORAGE_PROVIDER", originalStorageProvider);
    restoreEnv("NODE_ENV", originalNodeEnv);
    restoreEnv("ALIYUN_OSS_ACCESS_KEY_ID", originalOssAccessKeyId);
    restoreEnv("ALIYUN_OSS_ACCESS_KEY_SECRET", originalOssAccessKeySecret);
    restoreEnv("ALIYUN_OSS_BUCKET", originalOssBucket);
    restoreEnv("ALIYUN_OSS_REGION", originalOssRegion);
    restoreEnv("ALIYUN_OSS_PUBLIC_BASE_URL", originalOssPublicBaseUrl);
    restoreEnv("ALIYUN_OSS_PREFIX", originalOssPrefix);
    restoreEnv("ALIYUN_OSS_UPLOAD_PREFIX", originalOssUploadPrefix);
    restoreEnv("ALIYUN_OSS_GENERATED_PREFIX", originalOssGeneratedPrefix);
    restoreEnv("ALIYUN_OSS_FAVORITE_PREFIX", originalOssFavoritePrefix);
    restoreEnv("ALIYUN_OSS_SITE_ASSET_PREFIX", originalOssSiteAssetPrefix);
    restoreEnv("ALIYUN_OSS_TEMP_PREFIX", originalOssTempPrefix);
  });

  it("defaults to OSS and rejects explicit ImgBB in production", () => {
    delete process.env.IMAGE_STORAGE_PROVIDER;
    expect(getImageStorageAdapter().provider).toBe("aliyun-oss");
    vi.stubEnv("NODE_ENV", "production");
    process.env.IMAGE_STORAGE_PROVIDER = "imgbb";
    expect(() => getImageStorageAdapter()).toThrow("生产环境仅允许");
  });

  it("only treats canonical registry capabilities as durable in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.IMAGE_STORAGE_PROVIDER = "aliyun-oss";
    process.env.ALIYUN_OSS_ACCESS_KEY_ID = "test-access-key-id";
    process.env.ALIYUN_OSS_ACCESS_KEY_SECRET = "test-access-key-secret";
    process.env.ALIYUN_OSS_BUCKET = "vasthk";
    process.env.ALIYUN_OSS_REGION = "oss-cn-hongkong";
    process.env.ALIYUN_OSS_PUBLIC_BASE_URL = "https://vasthk.oss-cn-hongkong.aliyuncs.com";

    expect(isStableStoredImageUrl("/api/media-assets/6ba7b810-9dad-41d1-80b4-00c04fd430c8")).toBe(true);
    expect(isStableStoredImageUrl("https://vasthk.oss-cn-hongkong.aliyuncs.com/generated/raw.png")).toBe(false);
    expect(isStableStoredImageUrl("https://vasthk.oss-cn-hongkong.aliyuncs.com/generated/raw.png?Signature=secret")).toBe(false);
  });

  it("returns already-persisted ImgBB URLs without reuploading", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const url = "https://i.ibb.co/example/result.png";

    await expect(persistGeneratedImageUrls([url], "gen-1")).resolves.toEqual([url]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uploads remote result URLs directly instead of converting to base64", async () => {
    const uploadedImages: unknown[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://api.imgbb.com/1/upload");
      const body = init?.body as FormData;
      uploadedImages.push(body.get("image"));

      return Response.json({
        success: true,
        data: { url: "https://i.ibb.co/persisted/result.png" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(persistGeneratedImageUrls(["https://provider.example/result.png"], "gen-2")).resolves.toEqual([
      "https://i.ibb.co/persisted/result.png",
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(uploadedImages).toEqual(["https://provider.example/result.png"]);
  });

  it("fails closed instead of persisting a temporary provider URL when storage fails", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn(async () => new Response("bad request", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    const providerUrl = "https://provider.example/result.png";

    await expect(persistGeneratedImageUrls([providerUrl], "gen-3"))
      .rejects.toThrow("generated image was not durably stored");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("preserves generated result naming with start indexes", async () => {
    const uploadedNames: unknown[] = [];
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = init?.body as FormData;
      uploadedNames.push(body.get("name"));

      return Response.json({
        success: true,
        data: { url: `https://i.ibb.co/persisted/${uploadedNames.length}.png` },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      persistGeneratedImageUrls(["data:image/png;base64,aaa", "data:image/png;base64,bbb"], "gen-4", {
        startIndex: 2,
      })
    ).resolves.toEqual(["https://i.ibb.co/persisted/1.png", "https://i.ibb.co/persisted/2.png"]);

    expect(uploadedNames).toEqual(["generated-gen-4-3", "generated-gen-4-4"]);
  });

  it("uploads generated data URLs to Aliyun OSS when configured", async () => {
    process.env.IMAGE_STORAGE_PROVIDER = "aliyun-oss";
    process.env.ALIYUN_OSS_ACCESS_KEY_ID = "test-access-key-id";
    process.env.ALIYUN_OSS_ACCESS_KEY_SECRET = "test-access-key-secret";
    process.env.ALIYUN_OSS_BUCKET = "vasthk";
    process.env.ALIYUN_OSS_REGION = "oss-cn-hongkong";
    process.env.ALIYUN_OSS_PUBLIC_BASE_URL = "https://vasthk.oss-cn-hongkong.aliyuncs.com";
    process.env.ALIYUN_OSS_PREFIX = "ai-tryon";
    process.env.ALIYUN_OSS_GENERATED_PREFIX = "generated-results/original";

    const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADUlEQVQImWP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==";
    const putCalls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      putCalls.push({ url, init });
      return new Response("", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const [url] = await persistGeneratedImageUrls([`data:image/png;base64,${pngBase64}`], "gen-oss");

    expect(url).toMatch(/^https:\/\/vasthk\.oss-cn-hongkong\.aliyuncs\.com\/generated-results\/original\/by-generation\//);
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0].url).toContain("https://vasthk.oss-cn-hongkong.aliyuncs.com/generated-results/original/");
    expect((putCalls[0].init?.headers as Record<string, string>).Authorization).toMatch(/^OSS test-access-key-id:/);
    expect((putCalls[0].init?.headers as Record<string, string>)["Content-Type"]).toBe("image/png");
    expect((putCalls[0].init?.headers as Record<string, string>)["x-oss-object-acl"]).toBe("private");
  });

  it("normalizes AVIF uploads to JPEG before storing in Aliyun OSS", async () => {
    process.env.IMAGE_STORAGE_PROVIDER = "aliyun-oss";
    process.env.ALIYUN_OSS_ACCESS_KEY_ID = "test-access-key-id";
    process.env.ALIYUN_OSS_ACCESS_KEY_SECRET = "test-access-key-secret";
    process.env.ALIYUN_OSS_BUCKET = "vasthk";
    process.env.ALIYUN_OSS_REGION = "oss-cn-hongkong";
    process.env.ALIYUN_OSS_PUBLIC_BASE_URL = "https://vasthk.oss-cn-hongkong.aliyuncs.com";
    process.env.ALIYUN_OSS_PREFIX = "ai-tryon";

    const putCalls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      putCalls.push({ url, init });
      return new Response("", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const stored = await storeImage({
      image: `data:image/avif;base64,${tinyAvifBase64}`,
      name: "source-avif",
      storageClass: "upload",
    });

    expect(new URL(stored.url).pathname).toMatch(/source-avif\.jpg$/);
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0].url).toMatch(/source-avif\.jpg$/);
    expect((putCalls[0].init?.headers as Record<string, string>)["Content-Type"]).toBe("image/jpeg");
    expect(Buffer.from(putCalls[0].init?.body as ArrayBuffer).subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  }, 15_000);

  it("uploads multipart-style JPEG bytes to Aliyun OSS without base64 wrapping", async () => {
    process.env.IMAGE_STORAGE_PROVIDER = "aliyun-oss";
    process.env.ALIYUN_OSS_ACCESS_KEY_ID = "test-access-key-id";
    process.env.ALIYUN_OSS_ACCESS_KEY_SECRET = "test-access-key-secret";
    process.env.ALIYUN_OSS_BUCKET = "vasthk";
    process.env.ALIYUN_OSS_REGION = "oss-cn-hongkong";
    process.env.ALIYUN_OSS_PUBLIC_BASE_URL = "https://vasthk.oss-cn-hongkong.aliyuncs.com";
    process.env.ALIYUN_OSS_PREFIX = "ai-tryon";

    const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0xff, 0xd9]);
    const putCalls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      putCalls.push({ url, init });
      return new Response("", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const stored = await storeImage({
      bytes: jpegBytes,
      contentType: "",
      name: "reference-photo.jpg",
      storageClass: "upload",
    });

    expect(new URL(stored.url).pathname).toMatch(/reference-photo\.jpg$/);
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0].url).toMatch(/reference-photo\.jpg$/);
    expect((putCalls[0].init?.headers as Record<string, string>)["Content-Type"]).toBe("image/jpeg");
    expect(Buffer.from(putCalls[0].init?.body as ArrayBuffer)).toEqual(jpegBytes);
  });

  it("uses image magic bytes over incorrect declared content types", async () => {
    process.env.IMAGE_STORAGE_PROVIDER = "aliyun-oss";
    process.env.ALIYUN_OSS_ACCESS_KEY_ID = "test-access-key-id";
    process.env.ALIYUN_OSS_ACCESS_KEY_SECRET = "test-access-key-secret";
    process.env.ALIYUN_OSS_BUCKET = "vasthk";
    process.env.ALIYUN_OSS_REGION = "oss-cn-hongkong";
    process.env.ALIYUN_OSS_PUBLIC_BASE_URL = "https://vasthk.oss-cn-hongkong.aliyuncs.com";
    process.env.ALIYUN_OSS_PREFIX = "ai-tryon";

    const putCalls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      putCalls.push({ url, init });
      return new Response("", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const stored = await storeImage({
      bytes: Buffer.from(tinyAvifBase64, "base64"),
      contentType: "image/jpeg",
      name: "mislabeled-reference.jpg",
      storageClass: "upload",
    });

    expect(new URL(stored.url).pathname).toMatch(/mislabeled-reference\.jpg$/);
    expect(putCalls).toHaveLength(1);
    expect((putCalls[0].init?.headers as Record<string, string>)["Content-Type"]).toBe("image/jpeg");
    expect(Buffer.from(putCalls[0].init?.body as ArrayBuffer).subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  }, 15_000);
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
