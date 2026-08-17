import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createUploadAssetOriginKey,
  createUploadRegistrationToken,
  normalizeTrustedUploadDescriptor,
  registerTrustedUploadedResourceAsset,
  verifyUploadRegistrationToken,
  type TrustedUploadDescriptor,
} from "@/lib/resource-library/upload-registration";

const descriptor: TrustedUploadDescriptor = {
  url: "https://bucket.oss-cn-hongkong.aliyuncs.com/private-user-uploads/2026/08/17/shoe%20photo.png",
  objectKey: "private-user-uploads/2026/08/17/shoe photo.png",
  mediaType: "image",
  title: "shoe photo",
  originalFilename: "shoe photo.png",
  mimeType: "image/png",
  byteSize: 2048,
  width: 1024,
  height: 1024,
};

describe("trusted resource upload registration", () => {
  beforeEach(() => {
    vi.stubEnv("ALIYUN_OSS_PUBLIC_BASE_URL", "https://bucket.oss-cn-hongkong.aliyuncs.com");
    vi.stubEnv("ALIYUN_OSS_UPLOAD_PREFIX", "private-user-uploads");
    vi.stubEnv("ALIYUN_OSS_ACCESS_KEY_SECRET", "unit-test-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("round-trips a short-lived token bound to the authenticated user", () => {
    const token = createUploadRegistrationToken("user-1", descriptor);
    expect(verifyUploadRegistrationToken(token, "user-1")).toMatchObject(descriptor);
    expect(() => verifyUploadRegistrationToken(token, "user-2"))
      .toThrowError(expect.objectContaining({ code: "INVALID_UPLOAD_REGISTRATION_TOKEN" }));
  });

  it("rejects tampered tokens, arbitrary hosts, and keys outside the upload prefix", () => {
    const token = createUploadRegistrationToken("user-1", descriptor);
    expect(() => verifyUploadRegistrationToken(`${token.slice(0, -1)}x`, "user-1"))
      .toThrowError(expect.objectContaining({ code: "INVALID_UPLOAD_REGISTRATION_TOKEN" }));
    expect(() => normalizeTrustedUploadDescriptor({ ...descriptor, url: "https://attacker.example/forged.png" }))
      .toThrowError(expect.objectContaining({ code: "UNTRUSTED_UPLOAD_URL" }));
    expect(() => normalizeTrustedUploadDescriptor({
      ...descriptor,
      objectKey: "site-assets/original/forged.png",
      url: "https://bucket.oss-cn-hongkong.aliyuncs.com/site-assets/original/forged.png",
    })).toThrowError(expect.objectContaining({ code: "UNTRUSTED_UPLOAD_PREFIX" }));
  });

  it("upserts an OSS upload with a deterministic, non-URL origin key", async () => {
    let inserted: Record<string, unknown> | null = null;
    const query = {
      upsert: vi.fn(),
      select: vi.fn(),
      single: vi.fn(),
    };
    query.upsert.mockImplementation((row: Record<string, unknown>) => {
      inserted = row;
      return query;
    });
    query.select.mockReturnValue(query);
    query.single.mockImplementation(async () => ({
      data: {
        id: "asset-1",
        ...inserted,
        saved_at: "2026-08-17T08:00:00.000Z",
        created_at: "2026-08-17T08:00:00.000Z",
        updated_at: "2026-08-17T08:00:00.000Z",
      },
      error: null,
    }));
    const supabase = { from: vi.fn(() => query) };

    const asset = await registerTrustedUploadedResourceAsset(supabase as never, "user-1", descriptor);

    expect(query.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        source_type: "upload",
        object_key: descriptor.objectKey,
        origin_key: createUploadAssetOriginKey(descriptor.objectKey),
        url: descriptor.url,
      }),
      { onConflict: "user_id,origin_key" },
    );
    expect(asset).toMatchObject({ id: "asset-1", sourceType: "upload", url: descriptor.url });
  });
});
