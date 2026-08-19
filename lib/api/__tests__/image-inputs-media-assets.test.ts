import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const createRegistryReadUrl = vi.fn();
const libraryMaybeSingle = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: () => ({
    rpc,
    from: () => {
      const chain = {
        eq: () => chain,
        in: () => chain,
        is: () => chain,
        select: () => chain,
        limit: () => ({ maybeSingle: libraryMaybeSingle }),
      };
      return chain;
    },
  }),
}));

vi.mock("@/lib/api/media-storage", () => ({
  createAliyunOssRegistryReadUrl: (...args: unknown[]) => createRegistryReadUrl(...args),
}));

vi.mock("@/lib/api/remote-image-fetch", () => ({
  assertRemoteImageUrlAllowed: vi.fn().mockResolvedValue(undefined),
}));

import { resolveImageInputs, resolveMediaInput } from "@/lib/api/image-inputs.server";

const ASSET_ID = "018f47f1-b4c2-7a21-8f12-7a02169b89c1";
const OWNER_ID = "018f47f1-b4c2-7a21-8f12-7a02169b89c2";

describe("canonical media asset provider inputs", () => {
  beforeEach(() => {
    rpc.mockReset();
    createRegistryReadUrl.mockReset();
    createRegistryReadUrl.mockReturnValue("https://oss.example/private.jpg?Expires=short");
    libraryMaybeSingle.mockReset();
    libraryMaybeSingle.mockResolvedValue({ data: null, error: null });
    rpc.mockResolvedValue({
      data: [{
        asset_id: ASSET_ID,
        bucket_name: "private-bucket",
        object_key: "ai-tryon/user-uploads/original/private.jpg",
        mime_type: "image/jpeg",
        size_bytes: 123,
        sha256: "a".repeat(64),
        purpose: "image_input",
      }],
      error: null,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("resolves a verified canonical asset with an explicit tenant fence", async () => {
    const result = await resolveImageInputs(
      { clothingUrls: [`/api/media-assets/${ASSET_ID}`] },
      { publicBaseUrl: "https://app.example", ownerUserId: OWNER_ID },
    );

    expect(rpc).toHaveBeenCalledWith("resolve_verified_media_asset_for_worker", {
      p_asset_id: ASSET_ID,
      p_expected_owner_user_id: OWNER_ID,
    });
    expect(createRegistryReadUrl).toHaveBeenCalledWith(
      "ai-tryon/user-uploads/original/private.jpg",
      "private-bucket",
    );
    expect(result.clothingUrls).toEqual(["https://oss.example/private.jpg?Expires=short"]);
  });

  it("recognizes only same-origin absolute canonical URLs", async () => {
    await resolveMediaInput(`https://app.example/api/media-assets/${ASSET_ID}`, {
      publicBaseUrl: "https://app.example",
      ownerUserId: OWNER_ID,
      expectedKind: "image",
    });
    expect(rpc).toHaveBeenCalledTimes(1);

    await expect(resolveMediaInput(`https://other.example/api/media-assets/${ASSET_ID}`, {
      publicBaseUrl: "https://app.example",
      ownerUserId: OWNER_ID,
      expectedKind: "image",
    })).resolves.toBe(`https://other.example/api/media-assets/${ASSET_ID}`);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("fails closed without a tenant owner or with the wrong verified media kind", async () => {
    await expect(resolveMediaInput(`/api/media-assets/${ASSET_ID}`, {
      publicBaseUrl: "https://app.example",
      expectedKind: "image",
    })).rejects.toThrow("owner fence");

    rpc.mockResolvedValueOnce({
      data: [{
        bucket_name: "private-bucket",
        object_key: "ai-tryon/user-uploads/original/private.mp4",
        mime_type: "video/mp4",
      }],
      error: null,
    });
    await expect(resolveMediaInput(`/api/media-assets/${ASSET_ID}`, {
      publicBaseUrl: "https://app.example",
      ownerUserId: OWNER_ID,
      expectedKind: "image",
    })).rejects.toThrow("unavailable, unverified, or owned by another tenant");
  });

  it("resolves verified audio for custom video soundtracks and rejects kind confusion", async () => {
    rpc.mockResolvedValueOnce({
      data: [{
        bucket_name: "private-bucket",
        object_key: "ai-tryon/user-uploads/audio/track.mp3",
        mime_type: "audio/mpeg",
      }],
      error: null,
    });
    createRegistryReadUrl.mockReturnValueOnce("https://oss.example/track.mp3?Expires=short");

    await expect(resolveMediaInput(`/api/media-assets/${ASSET_ID}`, {
      publicBaseUrl: "https://app.example",
      ownerUserId: OWNER_ID,
      expectedKind: "audio",
    })).resolves.toBe("https://oss.example/track.mp3?Expires=short");

    rpc.mockResolvedValueOnce({
      data: [{
        bucket_name: "private-bucket",
        object_key: "ai-tryon/user-uploads/audio/not-audio.mp4",
        mime_type: "video/mp4",
      }],
      error: null,
    });
    await expect(resolveMediaInput(`/api/media-assets/${ASSET_ID}`, {
      publicBaseUrl: "https://app.example",
      ownerUserId: OWNER_ID,
      expectedKind: "audio",
    })).rejects.toThrow("unavailable, unverified, or owned by another tenant");
  });

  it("rejects arbitrary production URLs while allowing the configured immutable site-asset prefix", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALIYUN_OSS_PUBLIC_BASE_URL", "https://assets.example.com");
    vi.stubEnv("ALIYUN_OSS_SITE_ASSET_PREFIX", "site-assets/original");

    await expect(resolveMediaInput("https://attacker.example/private.png", {
      ownerUserId: OWNER_ID,
      expectedKind: "image",
    })).rejects.toThrow("canonical tenant asset");

    await expect(resolveMediaInput("https://assets.example.com/site-assets/original/template.png", {
      ownerUserId: OWNER_ID,
      expectedKind: "image",
    })).resolves.toBe("https://assets.example.com/site-assets/original/template.png");

    await expect(resolveMediaInput("data:image/png;base64,iVBORw0KGgo=", {
      ownerUserId: OWNER_ID,
      expectedKind: "image",
    })).rejects.toThrow("canonical tenant asset");
  });

  it("accepts a legacy OSS URL that exists in the owner's resource library", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALIYUN_OSS_PUBLIC_BASE_URL", "https://assets.example.com");
    vi.stubEnv("ALIYUN_OSS_SITE_ASSET_PREFIX", "site-assets/original");
    libraryMaybeSingle.mockResolvedValue({ data: { id: "row-1" }, error: null });

    const legacyUrl = "https://assets.example.com/user-uploads/original/legacy.png";
    await expect(resolveMediaInput(legacyUrl, {
      ownerUserId: OWNER_ID,
      expectedKind: "image",
    })).resolves.toBe(legacyUrl);
    expect(libraryMaybeSingle).toHaveBeenCalled();
  });

  it("still rejects an unowned production URL even when the host looks like the OSS base", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALIYUN_OSS_PUBLIC_BASE_URL", "https://assets.example.com");
    vi.stubEnv("ALIYUN_OSS_SITE_ASSET_PREFIX", "site-assets/original");

    await expect(resolveMediaInput("https://assets.example.com/user-uploads/original/stolen.png", {
      ownerUserId: OWNER_ID,
      expectedKind: "image",
    })).rejects.toThrow("canonical tenant asset");
  });
});
