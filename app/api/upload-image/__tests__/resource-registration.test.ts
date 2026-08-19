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
      content_type: "image/webp",
      byte_size: 4096,
      object_key: "uploads/image.png",
    });
  });

  it("rejects the retired base64 JSON upload path", async () => {
    const response = await POST(uploadRequest());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "无效的上传签发请求" });
    expect(mocks.storeImage).not.toHaveBeenCalled();
  });

  it("does not attempt the legacy catalog-registration path", async () => {
    const response = await POST(uploadRequest());

    expect(response.status).toBe(400);
    expect(mocks.registerTrustedUploadedResourceAsset).not.toHaveBeenCalled();
  });

  it("requires a direct-upload prepare request instead of raw JSON bytes", async () => {
    const response = await POST(uploadRequest());

    expect(response.status).toBe(400);
    expect(mocks.registerTrustedUploadedResourceAsset).not.toHaveBeenCalled();
  });
});

function uploadRequest() {
  return new Request("http://localhost/api/upload-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: "data:image/png;base64,eA==", name: "image" }),
  });
}
