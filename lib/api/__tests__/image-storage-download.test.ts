import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAliyunOssDownloadUrl } from "../image-storage";

describe("Aliyun OSS download URL", () => {
  const originalEnv = {
    accessKeyId: process.env.ALIYUN_OSS_ACCESS_KEY_ID,
    accessKeySecret: process.env.ALIYUN_OSS_ACCESS_KEY_SECRET,
    bucket: process.env.ALIYUN_OSS_BUCKET,
    region: process.env.ALIYUN_OSS_REGION,
    publicBaseUrl: process.env.ALIYUN_OSS_PUBLIC_BASE_URL,
    downloadBaseUrl: process.env.ALIYUN_OSS_DOWNLOAD_BASE_URL,
    endpoint: process.env.ALIYUN_OSS_ENDPOINT,
    securityToken: process.env.ALIYUN_OSS_SECURITY_TOKEN,
    imageHosts: process.env.NEXT_PUBLIC_ALIYUN_OSS_IMAGE_HOSTS,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    process.env.ALIYUN_OSS_ACCESS_KEY_ID = "test-access-key-id";
    process.env.ALIYUN_OSS_ACCESS_KEY_SECRET = "test-access-key-secret";
    process.env.ALIYUN_OSS_BUCKET = "vastweargen-images";
    process.env.ALIYUN_OSS_REGION = "oss-cn-hongkong";
    process.env.ALIYUN_OSS_PUBLIC_BASE_URL = "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com";
    process.env.NEXT_PUBLIC_ALIYUN_OSS_IMAGE_HOSTS = "vastweargen-images.cn-hongkong.thepacificxxs.com";
    delete process.env.ALIYUN_OSS_DOWNLOAD_BASE_URL;
    delete process.env.ALIYUN_OSS_ENDPOINT;
    delete process.env.ALIYUN_OSS_SECURITY_TOKEN;
  });

  afterEach(() => {
    vi.useRealTimers();
    restoreEnv("ALIYUN_OSS_ACCESS_KEY_ID", originalEnv.accessKeyId);
    restoreEnv("ALIYUN_OSS_ACCESS_KEY_SECRET", originalEnv.accessKeySecret);
    restoreEnv("ALIYUN_OSS_BUCKET", originalEnv.bucket);
    restoreEnv("ALIYUN_OSS_REGION", originalEnv.region);
    restoreEnv("ALIYUN_OSS_PUBLIC_BASE_URL", originalEnv.publicBaseUrl);
    restoreEnv("ALIYUN_OSS_DOWNLOAD_BASE_URL", originalEnv.downloadBaseUrl);
    restoreEnv("ALIYUN_OSS_ENDPOINT", originalEnv.endpoint);
    restoreEnv("ALIYUN_OSS_SECURITY_TOKEN", originalEnv.securityToken);
    restoreEnv("NEXT_PUBLIC_ALIYUN_OSS_IMAGE_HOSTS", originalEnv.imageHosts);
  });

  it("generates a short-lived signed attachment URL for configured OSS hosts", () => {
    const signedUrl = createAliyunOssDownloadUrl(
      "https://vastweargen-images.cn-hongkong.thepacificxxs.com/ai-tryon/generated/test-file.jpg",
      "tryon-result.jpg"
    );

    expect(signedUrl).not.toBeNull();
    const parsedUrl = new URL(signedUrl as string);
    const expectedExpires = String(Math.floor(Date.now() / 1000) + 300);
    const expectedDisposition = "attachment; filename=\"tryon-result.jpg\"; filename*=UTF-8''tryon-result.jpg";
    const expectedSignature = createHmac("sha1", "test-access-key-secret")
      .update([
        "GET",
        "",
        "",
        expectedExpires,
        `/vastweargen-images/ai-tryon/generated/test-file.jpg?response-content-disposition=${expectedDisposition}`,
      ].join("\n"))
      .digest("base64");

    expect(parsedUrl.hostname).toBe("vastweargen-images.oss-cn-hongkong.aliyuncs.com");
    expect(parsedUrl.pathname).toBe("/ai-tryon/generated/test-file.jpg");
    expect(parsedUrl.searchParams.get("OSSAccessKeyId")).toBe("test-access-key-id");
    expect(parsedUrl.searchParams.get("Expires")).toBe(expectedExpires);
    expect(parsedUrl.searchParams.get("response-content-disposition")).toBe(expectedDisposition);
    expect(parsedUrl.searchParams.get("Signature")).toBe(expectedSignature);
  });

  it("does not sign URLs outside configured OSS hosts", () => {
    expect(createAliyunOssDownloadUrl("https://provider.example.com/result.jpg", "result.jpg")).toBeNull();
  });

  it("can use a configured download base URL for CDN downloads", () => {
    process.env.ALIYUN_OSS_DOWNLOAD_BASE_URL = "https://cdn.example.com/assets";

    const signedUrl = createAliyunOssDownloadUrl(
      "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/ai-tryon/generated/test-file.jpg",
      "tryon-result.jpg"
    );

    expect(signedUrl).not.toBeNull();
    const parsedUrl = new URL(signedUrl as string);
    expect(parsedUrl.origin).toBe("https://cdn.example.com");
    expect(parsedUrl.pathname).toBe("/assets/ai-tryon/generated/test-file.jpg");
    expect(parsedUrl.searchParams.get("Signature")).toBeTruthy();
  });
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
