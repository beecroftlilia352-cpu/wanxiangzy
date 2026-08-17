import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  checkRateLimit: vi.fn(),
  storeImage: vi.fn(),
  getAdminClient: vi.fn(),
  createUploadRegistrationToken: vi.fn(),
  registerTrustedUploadedResourceAsset: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({ requireApiUser: mocks.requireApiUser }));
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  rateLimitResponse: vi.fn(),
}));
vi.mock("@/lib/api/image-storage", () => ({ storeImage: mocks.storeImage }));
vi.mock("@/lib/supabase/admin", () => ({ getAdminClient: mocks.getAdminClient }));
vi.mock("@/lib/resource-library/upload-registration", () => ({
  createUploadRegistrationToken: mocks.createUploadRegistrationToken,
  registerTrustedUploadedResourceAsset: mocks.registerTrustedUploadedResourceAsset,
}));

import { POST } from "@/app/api/upload-image/route";

describe("upload-image resource registration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({ user: { id: "user-1" }, response: null });
    mocks.checkRateLimit.mockResolvedValue({ ok: true });
    mocks.getAdminClient.mockReturnValue({ admin: true });
    mocks.createUploadRegistrationToken.mockReturnValue("signed-token");
    mocks.storeImage.mockResolvedValue({
      url: "https://bucket.oss-cn-hongkong.aliyuncs.com/uploads/image.png",
      display_url: "https://bucket.oss-cn-hongkong.aliyuncs.com/uploads/image.png",
      delete_url: "",
      width: 1024,
      height: 1024,
      object_key: "uploads/image.png",
    });
  });

  it("returns the persisted resource asset with the upload response", async () => {
    mocks.registerTrustedUploadedResourceAsset.mockResolvedValue({ id: "asset-1", sourceType: "upload" });

    const response = await POST(uploadRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ asset: { id: "asset-1" }, resource_registration_token: "signed-token" });
    expect(mocks.registerTrustedUploadedResourceAsset).toHaveBeenCalledWith(
      { admin: true },
      "user-1",
      expect.objectContaining({
        url: "https://bucket.oss-cn-hongkong.aliyuncs.com/uploads/image.png",
        objectKey: "uploads/image.png",
        mediaType: "image",
      }),
    );
  });

  it("does not turn a successful OSS upload into a failure when catalog registration fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.registerTrustedUploadedResourceAsset.mockRejectedValue(new Error("migration pending"));

    const response = await POST(uploadRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.url).toContain("aliyuncs.com/uploads/image.png");
    expect(body.asset).toBeUndefined();
    expect(body.resource_registration_token).toBe("signed-token");
    consoleError.mockRestore();
  });
});

function uploadRequest() {
  return new Request("http://localhost/api/upload-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: "data:image/png;base64,eA==", name: "image" }),
  });
}
