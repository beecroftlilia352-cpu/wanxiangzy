import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireApiUser,
  resolveVerifiedMediaAssetForViewer,
  createAliyunOssRegistryReadUrl,
  maybeSingle,
} = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  resolveVerifiedMediaAssetForViewer: vi.fn(),
  createAliyunOssRegistryReadUrl: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("@/lib/api/auth", () => ({ requireApiUser }));
vi.mock("@/lib/api/media-asset-viewer.server", () => ({ resolveVerifiedMediaAssetForViewer }));
vi.mock("@/lib/api/media-storage", () => ({ createAliyunOssRegistryReadUrl }));

import { GET } from "@/app/api/media-assets/[assetId]/route";

const ASSET_ID = "123e4567-e89b-42d3-a456-426614174000";

describe("canonical media asset download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    maybeSingle.mockResolvedValue({ data: { id: ASSET_ID, status: "verified" }, error: null });
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({ maybeSingle })),
        })),
      })),
    };
    requireApiUser.mockResolvedValue({
      supabase,
      user: { id: "user-1" },
      response: new Response(null, { status: 401 }),
    });
    resolveVerifiedMediaAssetForViewer.mockResolvedValue({
      bucketName: "media-bucket",
      objectKey: "generated/object-without-extension",
      mimeType: "image/jpeg",
    });
    createAliyunOssRegistryReadUrl.mockReturnValue("https://oss.example.com/generated/object?signed=1");
  });

  it("replaces a client-default png suffix with the registry JPEG extension", async () => {
    const response = await GET(
      new Request(`https://app.example/api/media-assets/${ASSET_ID}?resolve=1&filename=result.png`),
      { params: Promise.resolve({ assetId: ASSET_ID }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      strategy: "direct",
      url: "https://oss.example.com/generated/object?signed=1",
      filename: "result.jpg",
      mime_type: "image/jpeg",
    });
    expect(createAliyunOssRegistryReadUrl).toHaveBeenCalledWith(
      "generated/object-without-extension",
      "media-bucket",
      "result.jpg",
    );
  });
});
