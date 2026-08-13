import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RemoteImageFetchError } from "../remote-image-fetch";
import { storeMedia } from "../media-storage";

describe("media storage", () => {
  const originalEnv = {
    provider: process.env.IMAGE_STORAGE_PROVIDER,
    accessKeyId: process.env.ALIYUN_OSS_ACCESS_KEY_ID,
    accessKeySecret: process.env.ALIYUN_OSS_ACCESS_KEY_SECRET,
    bucket: process.env.ALIYUN_OSS_BUCKET,
    region: process.env.ALIYUN_OSS_REGION,
    publicBaseUrl: process.env.ALIYUN_OSS_PUBLIC_BASE_URL,
    prefix: process.env.ALIYUN_OSS_PREFIX,
  };

  beforeEach(() => {
    process.env.IMAGE_STORAGE_PROVIDER = "aliyun-oss";
    process.env.ALIYUN_OSS_ACCESS_KEY_ID = "test-access-key-id";
    process.env.ALIYUN_OSS_ACCESS_KEY_SECRET = "test-access-key-secret";
    process.env.ALIYUN_OSS_BUCKET = "vasthk";
    process.env.ALIYUN_OSS_REGION = "oss-cn-hongkong";
    process.env.ALIYUN_OSS_PUBLIC_BASE_URL = "https://vasthk.oss-cn-hongkong.aliyuncs.com";
    process.env.ALIYUN_OSS_PREFIX = "ai-tryon";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    restoreEnv("IMAGE_STORAGE_PROVIDER", originalEnv.provider);
    restoreEnv("ALIYUN_OSS_ACCESS_KEY_ID", originalEnv.accessKeyId);
    restoreEnv("ALIYUN_OSS_ACCESS_KEY_SECRET", originalEnv.accessKeySecret);
    restoreEnv("ALIYUN_OSS_BUCKET", originalEnv.bucket);
    restoreEnv("ALIYUN_OSS_REGION", originalEnv.region);
    restoreEnv("ALIYUN_OSS_PUBLIC_BASE_URL", originalEnv.publicBaseUrl);
    restoreEnv("ALIYUN_OSS_PREFIX", originalEnv.prefix);
  });

  it("downloads public remote media through the guarded fetch path before uploading to OSS", async () => {
    const videoBytes = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]);
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (init?.method === "PUT") return new Response("", { status: 200 });
      return new Response(videoBytes, {
        headers: {
          "content-length": String(videoBytes.length),
          "content-type": "video/mp4",
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const stored = await storeMedia({
      media: "https://93.184.216.34/generated-video.mp4",
      name: "generated-video",
      storageClass: "generated",
    });

    expect(stored.url).toMatch(/generated-video\.mp4$/);
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe("https://93.184.216.34/generated-video.mp4");
    expect(calls[0].init?.redirect).toBe("manual");
    expect(calls[1].url).toContain("https://vasthk.oss-cn-hongkong.aliyuncs.com/");
    expect((calls[1].init?.headers as Record<string, string>)["Content-Type"]).toBe("video/mp4");
  });

  it("blocks private remote media URLs before issuing a network request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      storeMedia({
        media: "https://127.0.0.1/private-video.mp4",
        name: "private-video",
        storageClass: "generated",
      })
    ).rejects.toBeInstanceOf(RemoteImageFetchError);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
