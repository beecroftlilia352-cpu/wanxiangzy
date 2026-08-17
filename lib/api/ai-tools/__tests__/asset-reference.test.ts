import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createAiToolMaskReference,
  isAiToolMaskReferenceUrl,
  verifyAiToolMaskReference,
} from "@/lib/api/ai-tools/asset-reference.server";

const ENV_KEYS = [
  "AI_TOOL_ASSET_REF_SECRET",
  "AI_TOOL_MASK_REF_TTL_SECONDS",
  "RESOURCE_LIBRARY_UPLOAD_TOKEN_SECRET",
  "ALIYUN_OSS_ACCESS_KEY_SECRET",
  "ALIYUN_OSS_PUBLIC_BASE_URL",
  "ALIYUN_OSS_PREFIX",
  "ALIYUN_OSS_TEMP_PREFIX",
  "ALIYUN_OSS_GENERATED_PREFIX",
] as const;

describe("AI tool mask references", () => {
  const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

  beforeEach(() => {
    process.env.AI_TOOL_ASSET_REF_SECRET = "test-mask-reference-secret";
    process.env.AI_TOOL_MASK_REF_TTL_SECONDS = "600";
    process.env.ALIYUN_OSS_PUBLIC_BASE_URL = "https://bucket.oss-cn-hongkong.aliyuncs.com";
    process.env.ALIYUN_OSS_TEMP_PREFIX = "temp/original";
    process.env.ALIYUN_OSS_GENERATED_PREFIX = "generated/original";
  });

  afterEach(() => {
    for (const key of ENV_KEYS) restoreEnv(key, originalEnv[key]);
  });

  it("creates an opaque URL-shaped reference bound to user, dimensions, object and expiry", () => {
    const reference = createReference(1_000);

    expect(reference.referenceUrl).toMatch(/^https:\/\/ai-tool-ref\.invalid\/mask\//);
    expect(reference.referenceUrl).not.toContain("bucket.oss-cn-hongkong");
    expect(isAiToolMaskReferenceUrl(reference.referenceUrl)).toBe(true);
    expect(reference.expiresAt).toBe(new Date(1_600_000).toISOString());

    expect(verifyAiToolMaskReference(reference.referenceUrl, "user-1", 1_100)).toMatchObject({
      token: reference.token,
      url: "https://bucket.oss-cn-hongkong.aliyuncs.com/temp/original/2026/mask.png",
      objectKey: "temp/original/2026/mask.png",
      width: 16,
      height: 12,
      contentType: "image/png",
    });
  });

  it("rejects cross-user, expired and tampered references", () => {
    const reference = createReference(1_000);

    expect(() => verifyAiToolMaskReference(reference.token, "user-2", 1_100))
      .toThrowError(expect.objectContaining({ code: "AI_TOOL_MASK_REFERENCE_FORBIDDEN", status: 403 }));
    expect(() => verifyAiToolMaskReference(reference.token, "user-1", 1_601))
      .toThrowError(expect.objectContaining({ code: "AI_TOOL_MASK_REFERENCE_EXPIRED", status: 410 }));
    expect(() => verifyAiToolMaskReference(`${reference.token.slice(0, -1)}x`, "user-1", 1_100))
      .toThrowError(expect.objectContaining({ code: "AI_TOOL_MASK_REFERENCE_INVALID" }));
  });

  it("accepts generated alpha objects for compose references", () => {
    const reference = createAiToolMaskReference({
      userId: "user-1",
      url: "https://bucket.oss-cn-hongkong.aliyuncs.com/generated/original/alpha.png",
      objectKey: "generated/original/alpha.png",
      width: 16,
      height: 12,
      contentType: "image/png",
      nowSeconds: 1_000,
    });

    expect(verifyAiToolMaskReference(reference.token, "user-1", 1_100)).toMatchObject({
      url: "https://bucket.oss-cn-hongkong.aliyuncs.com/generated/original/alpha.png",
      objectKey: "generated/original/alpha.png",
      contentType: "image/png",
    });
  });

  it("rejects non-AI-owned objects and fails closed without a signing secret", () => {
    expect(() => createAiToolMaskReference({
      userId: "user-1",
      url: "https://bucket.oss-cn-hongkong.aliyuncs.com/user-uploads/original/source.png",
      objectKey: "user-uploads/original/source.png",
      width: 16,
      height: 12,
      contentType: "image/png",
      nowSeconds: 1_000,
    })).toThrowError(expect.objectContaining({ code: "AI_TOOL_MASK_REFERENCE_INVALID" }));

    delete process.env.AI_TOOL_ASSET_REF_SECRET;
    delete process.env.RESOURCE_LIBRARY_UPLOAD_TOKEN_SECRET;
    delete process.env.ALIYUN_OSS_ACCESS_KEY_SECRET;
    expect(() => createReference(1_000)).toThrowError(expect.objectContaining({
      code: "AI_TOOL_ASSET_REFERENCE_NOT_CONFIGURED",
      status: 503,
    }));
  });
});

function createReference(nowSeconds: number) {
  return createAiToolMaskReference({
    userId: "user-1",
    url: "https://bucket.oss-cn-hongkong.aliyuncs.com/temp/original/2026/mask.png",
    objectKey: "temp/original/2026/mask.png",
    width: 16,
    height: 12,
    contentType: "image/png",
    nowSeconds,
  });
}

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
