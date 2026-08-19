import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  enforceApiRateLimit: vi.fn(),
  verifyUploadRegistrationToken: vi.fn(),
  registerTrustedUploadedResourceAsset: vi.fn(),
  registerVerifiedMediaAssetResource: vi.fn(),
  getAdminClient: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock("@/lib/api/rate-limit", () => ({
  API_RATE_LIMITS: { favoriteMutation: { bucket: "favorite" } },
  enforceApiRateLimit: mocks.enforceApiRateLimit,
}));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: mocks.getAdminClient }));
vi.mock("@/lib/resource-library/upload-registration", () => ({
  verifyUploadRegistrationToken: mocks.verifyUploadRegistrationToken,
  registerTrustedUploadedResourceAsset: mocks.registerTrustedUploadedResourceAsset,
  registerVerifiedMediaAssetResource: mocks.registerVerifiedMediaAssetResource,
}));

import { POST } from "@/app/api/resource-library/assets/from-upload/route";

describe("resource upload registration API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({ user: { id: "user-1" }, response: null });
    mocks.enforceApiRateLimit.mockResolvedValue(null);
    mocks.getAdminClient.mockReturnValue({ admin: true });
  });

  it("accepts only a verified upload receipt", async () => {
    const descriptor = {
      url: "https://bucket.oss-cn-hongkong.aliyuncs.com/uploads/image.png",
      objectKey: "uploads/image.png",
      mediaType: "image",
    };
    mocks.verifyUploadRegistrationToken.mockReturnValue(descriptor);
    mocks.registerTrustedUploadedResourceAsset.mockResolvedValue({ id: "asset-1" });

    const response = await POST(new Request("http://localhost/api/resource-library/assets/from-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "signed-upload-receipt" }),
    }));

    expect(mocks.verifyUploadRegistrationToken).toHaveBeenCalledWith("signed-upload-receipt", "user-1");
    expect(mocks.registerTrustedUploadedResourceAsset)
      .toHaveBeenCalledWith({ admin: true }, "user-1", descriptor);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ asset: { id: "asset-1" } });
  });

  it("registers a verified canonical media asset without accepting legacy URLs", async () => {
    mocks.registerVerifiedMediaAssetResource.mockResolvedValue({ id: "asset-2" });

    const response = await POST(new Request("http://localhost/api/resource-library/assets/from-upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        media_asset_id: "media-asset-2",
        title: "Studio source",
        original_filename: "source.png",
        token: "ignored-legacy-token",
      }),
    }));

    expect(mocks.registerVerifiedMediaAssetResource).toHaveBeenCalledWith(
      { admin: true },
      "user-1",
      { mediaAssetId: "media-asset-2", title: "Studio source", originalFilename: "source.png" },
    );
    expect(mocks.verifyUploadRegistrationToken).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ asset: { id: "asset-2" } });
  });
});
