import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

import {
  __directUploadTestUtils,
  completeDirectUpload,
  inspectVideoHeader,
  prepareDirectUpload,
  resolveSupportedImageContentType,
} from "@/lib/api/direct-oss-upload.server";
import { MediaAssetRegistryError } from "@/lib/api/media-asset-registry.server";

const ENV_KEYS = [
  "NODE_ENV",
  "UPLOAD_DELIVERY_MODE",
  "UPLOAD_INTENT_SECRET",
  "UPLOAD_DAILY_QUOTA_MB",
  "UPLOAD_MAX_ACTIVE_INTENTS",
  "REDIS_URL",
  "IMAGE_STORAGE_PROVIDER",
  "ALIYUN_OSS_ACCESS_KEY_ID",
  "ALIYUN_OSS_ACCESS_KEY_SECRET",
  "ALIYUN_OSS_BUCKET",
  "ALIYUN_OSS_REGION",
  "ALIYUN_OSS_PUBLIC_BASE_URL",
  "ALIYUN_OSS_UPLOAD_PREFIX",
] as const;

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
const ASSET_ID = "11111111-1111-4111-8111-111111111111";
const LEASE_TOKEN = "22222222-2222-4222-8222-222222222222";

function createRegistryDouble() {
  return {
    createUpload: vi.fn(async (input: { objectKey: string }) => ({
      assetId: ASSET_ID,
      status: "pending" as const,
      objectKey: input.objectKey,
      leaseToken: LEASE_TOKEN,
      fenceVersion: 1,
      leaseExpiresAt: new Date(Date.now() + 300_000).toISOString(),
      replayed: false,
    })),
    completeUpload: vi.fn(async () => ({
      assetId: ASSET_ID,
      status: "uploaded" as const,
      metadataMatches: true,
      fenceVersion: 2,
    })),
    verifyAsset: vi.fn(async () => ({ assetId: ASSET_ID, status: "verified" as const, fenceVersion: 3 })),
    failUpload: vi.fn(async () => undefined),
  };
}

describe("commercial OSS direct upload", () => {
  let registry: ReturnType<typeof createRegistryDouble>;

  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    process.env.UPLOAD_DELIVERY_MODE = "direct";
    process.env.UPLOAD_INTENT_SECRET = "test-only-upload-intent-secret-at-least-32-bytes";
    process.env.IMAGE_STORAGE_PROVIDER = "aliyun-oss";
    process.env.ALIYUN_OSS_ACCESS_KEY_ID = "test-access-key-id";
    process.env.ALIYUN_OSS_ACCESS_KEY_SECRET = "long-lived-secret-never-returned";
    process.env.ALIYUN_OSS_BUCKET = "test-bucket";
    process.env.ALIYUN_OSS_REGION = "oss-cn-hongkong";
    process.env.ALIYUN_OSS_PUBLIC_BASE_URL = "https://cdn.example.com";
    process.env.ALIYUN_OSS_UPLOAD_PREFIX = "user-uploads/original";
    delete process.env.REDIS_URL;
    __directUploadTestUtils.reset();
    registry = createRegistryDouble();
    __directUploadTestUtils.setMediaAssetRegistry(registry);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    for (const key of ENV_KEYS) restoreEnv(key, originalEnv[key]);
    __directUploadTestUtils.reset();
  });

  it("signs an exact short-lived policy without exposing the AccessKey secret", async () => {
    const hash = "a".repeat(64);
    const prepared = await prepareDirectUpload({
      userId: "user-123",
      kind: "image",
      purpose: "reference-image",
      file: { name: "../../avatar.jpg", size: 1234, contentType: "image/jpeg", sha256: hash },
    });
    expect(prepared.mode).toBe("direct");
    if (prepared.mode !== "direct") throw new Error("expected direct mode");

    expect(prepared.uploadUrl).toBe("https://test-bucket.oss-cn-hongkong.aliyuncs.com");
    expect(prepared.fields.OSSAccessKeyId).toBe("test-access-key-id");
    expect(JSON.stringify(prepared)).not.toContain("long-lived-secret-never-returned");
    expect(prepared.fields.key).toMatch(/^user-uploads\/original\/[a-f0-9]{24}\/reference-image\/aa\/a{64}\.jpg$/);
    expect(prepared.fields.key).not.toContain("user-123");
    expect(prepared.fields.key).not.toContain("avatar");
    expect(prepared.fields["x-oss-forbid-overwrite"]).toBe("true");
    expect(prepared.fields["x-oss-object-acl"]).toBe("private");
    expect(prepared.fields["x-oss-meta-sha256"]).toBe(hash);

    const policy = JSON.parse(Buffer.from(prepared.fields.policy, "base64").toString("utf8")) as { expiration: string; conditions: unknown[] };
    expect(Date.parse(policy.expiration) - Date.now()).toBeLessThanOrEqual(300_000);
    expect(policy.conditions).toContainEqual(["content-length-range", 1234, 1234]);
    expect(policy.conditions).toContainEqual(["eq", "$Content-Type", "image/jpeg"]);
    expect(policy.conditions).toContainEqual(["eq", "$key", prepared.fields.key]);
    expect(policy.conditions).toContainEqual(["eq", "$x-oss-forbid-overwrite", "true"]);
    expect(policy.conditions).toContainEqual(["eq", "$x-oss-object-acl", "private"]);
    expect(prepared.media_asset_id).toBe(ASSET_ID);
  });

  it("uses deterministic immutable keys for idempotent content", async () => {
    const input = {
      userId: "same-user",
      kind: "video" as const,
      file: { size: 2048, contentType: "video/mp4", sha256: "b".repeat(64) },
    };
    const first = await prepareDirectUpload(input);
    const second = await prepareDirectUpload(input);
    if (first.mode !== "direct" || second.mode !== "direct") throw new Error("expected direct mode");
    expect(second.fields.key).toBe(first.fields.key);
  });

  it("closes an image complete-to-verify crash window without re-uploading", async () => {
    registry.createUpload.mockImplementationOnce(async (input: { objectKey: string }) => ({
      assetId: ASSET_ID,
      status: "uploaded" as const,
      objectKey: input.objectKey,
      leaseToken: null,
      fenceVersion: 2,
      leaseExpiresAt: null,
      replayed: true,
    }) as never);
    await expect(prepareDirectUpload({
      userId: "resume-image-owner",
      kind: "image",
      file: { size: 100, contentType: "image/jpeg", sha256: "9".repeat(64) },
    })).resolves.toMatchObject({
      mode: "ready",
      status: "verified",
      media_asset_id: ASSET_ID,
    });
    expect(registry.verifyAsset).toHaveBeenCalledWith({ assetId: ASSET_ID, fenceVersion: 2 });
  });

  it("rejects unsupported MIME, oversized uploads, and invalid hashes", async () => {
    await expect(prepareDirectUpload({
      userId: "u",
      kind: "image",
      file: { size: 100, contentType: "text/html", sha256: "a".repeat(64) },
    })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(prepareDirectUpload({
      userId: "u",
      kind: "image",
      file: { size: 16 * 1024 * 1024, contentType: "image/jpeg", sha256: "a".repeat(64) },
    })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(prepareDirectUpload({
      userId: "u",
      kind: "video",
      file: { size: 100, contentType: "video/mp4", sha256: "not-a-hash" },
    })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("fails closed when production admission Redis is unavailable", async () => {
    vi.stubEnv("NODE_ENV", "production");
    __directUploadTestUtils.setRedisClient(null);
    await expect(prepareDirectUpload({
      userId: "u",
      kind: "image",
      file: { size: 100, contentType: "image/jpeg", sha256: "c".repeat(64) },
    })).rejects.toMatchObject({ code: "CAPACITY_UNAVAILABLE" });
  });

  it("enforces the distributed-equivalent local byte quota in tests", async () => {
    process.env.UPLOAD_DAILY_QUOTA_MB = "10";
    await prepareDirectUpload({
      userId: "quota-user",
      kind: "image",
      file: { size: 6 * 1024 * 1024, contentType: "image/jpeg", sha256: "d".repeat(64) },
    });
    await expect(prepareDirectUpload({
      userId: "quota-user",
      kind: "image",
      file: { size: 6 * 1024 * 1024, contentType: "image/jpeg", sha256: "e".repeat(64) },
    })).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" });
  });

  it("binds completion receipts to the authenticated user", async () => {
    const prepared = await prepareDirectUpload({
      userId: "owner",
      kind: "image",
      file: { size: 100, contentType: "image/jpeg", sha256: "f".repeat(64) },
    });
    if (prepared.mode !== "direct") throw new Error("expected direct mode");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(completeDirectUpload("attacker", prepared.token)).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("verifies HEAD metadata, bytes, SHA-256, image magic and pixel bounds before returning a URL", async () => {
    const bytes = await sharp({
      create: { width: 16, height: 12, channels: 3, background: "#ffaa00" },
    }).jpeg().toBuffer();
    const hash = createHash("sha256").update(bytes).digest("hex");
    const prepared = await prepareDirectUpload({
      userId: "image-owner",
      kind: "image",
      file: { size: bytes.length, contentType: "image/jpeg", sha256: hash },
    });
    if (prepared.mode !== "direct") throw new Error("expected direct mode");
    const fields = prepared.fields;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        status: 200,
        headers: {
          ETag: '"abc"',
          "Content-Length": String(bytes.length),
          "Content-Type": "image/jpeg",
          "x-oss-meta-sha256": hash,
          "x-oss-meta-upload-owner": fields["x-oss-meta-upload-owner"],
          "x-oss-meta-upload-purpose": "image-input",
        },
      }))
      .mockResolvedValueOnce(new Response(bufferToArrayBuffer(bytes), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(completeDirectUpload("image-owner", prepared.token)).resolves.toMatchObject({
      url: `/api/media-assets/${ASSET_ID}`,
      media_asset_id: ASSET_ID,
      status: "verified",
      width: 16,
      height: 12,
    });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "HEAD", redirect: "error" });
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "GET", redirect: "error" });
  });

  it("deletes an object that fails content validation", async () => {
    const bytes = Buffer.from("not an image");
    const hash = createHash("sha256").update(bytes).digest("hex");
    const prepared = await prepareDirectUpload({
      userId: "bad-image-owner",
      kind: "image",
      file: { size: bytes.length, contentType: "image/jpeg", sha256: hash },
    });
    if (prepared.mode !== "direct") throw new Error("expected direct mode");
    const fields = prepared.fields;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        status: 200,
        headers: {
          ETag: '"bad"',
          "Content-Length": String(bytes.length),
          "Content-Type": "image/jpeg",
          "x-oss-meta-sha256": hash,
          "x-oss-meta-upload-owner": fields["x-oss-meta-upload-owner"],
          "x-oss-meta-upload-purpose": "image-input",
        },
      }))
      .mockResolvedValueOnce(new Response(bufferToArrayBuffer(bytes), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(completeDirectUpload("bad-image-owner", prepared.token)).rejects.toMatchObject({ code: "UNSAFE_CONTENT" });
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ method: "DELETE" });
  });

  it("preserves the object when a fenced registry settlement has an uncertain network result", async () => {
    const bytes = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#0055aa" },
    }).png().toBuffer();
    const hash = createHash("sha256").update(bytes).digest("hex");
    const prepared = await prepareDirectUpload({
      userId: "uncertain-owner",
      kind: "image",
      file: { size: bytes.length, contentType: "image/png", sha256: hash },
    });
    if (prepared.mode !== "direct") throw new Error("expected direct mode");
    registry.completeUpload.mockRejectedValueOnce(new MediaAssetRegistryError("complete"));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        status: 200,
        headers: {
          ETag: '"uncertain"',
          "Content-Length": String(bytes.length),
          "Content-Type": "image/png",
          "x-oss-meta-sha256": hash,
          "x-oss-meta-upload-owner": prepared.fields["x-oss-meta-upload-owner"],
          "x-oss-meta-upload-purpose": "image-input",
        },
      }))
      .mockResolvedValueOnce(new Response(bufferToArrayBuffer(bytes), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(completeDirectUpload("uncertain-owner", prepared.token)).rejects.toMatchObject({
      code: "ASSET_REGISTRY_UNAVAILABLE",
      retryAfterSeconds: 5,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(registry.failUpload).not.toHaveBeenCalled();
  });

  it("accepts MP4/MOV magic and rejects extension-only payloads", () => {
    const header = Buffer.concat([Buffer.alloc(4), Buffer.from("ftyp"), Buffer.from("isom"), Buffer.alloc(32)]);
    expect(() => inspectVideoHeader(header, "video/mp4")).not.toThrow();
    expect(() => inspectVideoHeader(Buffer.from("fake.mp4"), "video/mp4"))
      .toThrowError(expect.objectContaining({ code: "UNSAFE_CONTENT" }));
  });

  it("accepts JPEG bytes even when the downloaded file is named and declared as PNG", async () => {
    const bytes = await sharp({
      create: { width: 4, height: 4, channels: 3, background: "#00aa55" },
    }).jpeg().toBuffer();

    expect(resolveSupportedImageContentType(bytes, "image/png", "downloaded.png"))
      .toBe("image/jpeg");
  });

  it("keeps direct video pending until the durable validation worker verifies the full stream", async () => {
    const bytes = Buffer.concat([Buffer.alloc(4), Buffer.from("ftyp"), Buffer.from("isom"), Buffer.alloc(32)]);
    const hash = createHash("sha256").update(bytes).digest("hex");
    const prepared = await prepareDirectUpload({
      userId: "video-owner",
      kind: "video",
      file: { size: bytes.length, contentType: "video/mp4", sha256: hash },
    });
    if (prepared.mode !== "direct") throw new Error("expected direct mode");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        status: 200,
        headers: {
          ETag: '"video"',
          "Content-Length": String(bytes.length),
          "Content-Type": "video/mp4",
          "x-oss-meta-sha256": hash,
          "x-oss-meta-upload-owner": prepared.fields["x-oss-meta-upload-owner"],
          "x-oss-meta-upload-purpose": "video-input",
        },
      }))
      .mockResolvedValueOnce(new Response(bufferToArrayBuffer(bytes), { status: 206 })));

    await expect(completeDirectUpload("video-owner", prepared.token)).resolves.toMatchObject({
      status: "pending_validation",
      media_asset_id: ASSET_ID,
      url: "",
    });
    expect(registry.completeUpload).toHaveBeenCalledOnce();
    expect(registry.verifyAsset).not.toHaveBeenCalled();
  });
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function bufferToArrayBuffer(bytes: Buffer) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
