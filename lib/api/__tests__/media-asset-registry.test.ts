import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: () => ({ rpc }),
}));

import {
  databaseMediaAssetRegistry,
  MediaAssetRegistryError,
} from "@/lib/api/media-asset-registry.server";

const ASSET_ID = "11111111-1111-4111-8111-111111111111";
const LEASE_TOKEN = "22222222-2222-4222-8222-222222222222";

describe("media asset registry adapter", () => {
  beforeEach(() => rpc.mockReset());

  it("creates a private fenced asset using the exact service-role RPC contract", async () => {
    rpc.mockResolvedValue({ data: [{
      asset_id: ASSET_ID,
      status: "pending",
      object_key: "user-uploads/original/key.jpg",
      lease_token: LEASE_TOKEN,
      fence_version: 1,
      lease_expires_at: "2026-08-18T00:05:00.000Z",
      replayed: false,
    }], error: null });

    await expect(databaseMediaAssetRegistry.createUpload({
      ownerUserId: "33333333-3333-4333-8333-333333333333",
      idempotencyKey: "upload:v1:image:hash",
      objectKey: "user-uploads/original/key.jpg",
      purpose: "reference-image",
      expectedSha256: "a".repeat(64),
      expectedSizeBytes: 123,
      expectedMimeType: "image/jpeg",
      leaseSeconds: 300,
      bucketName: "private-upload-bucket",
    })).resolves.toMatchObject({ assetId: ASSET_ID, leaseToken: LEASE_TOKEN, fenceVersion: 1 });

    expect(rpc).toHaveBeenCalledWith("create_media_asset_upload", {
      p_owner_user_id: "33333333-3333-4333-8333-333333333333",
      p_idempotency_key: "upload:v1:image:hash",
      p_object_key: "user-uploads/original/key.jpg",
      p_purpose: "reference_image",
      p_visibility: "private",
      p_storage_class: "standard",
      p_expected_sha256: "a".repeat(64),
      p_expected_size_bytes: 123,
      p_expected_mime_type: "image/jpeg",
      p_expected_width: null,
      p_expected_height: null,
      p_retention_until: null,
      p_lease_seconds: 300,
      p_bucket_name: "private-upload-bucket",
    });
  });

  it("settles and verifies with the returned fence version", async () => {
    rpc
      .mockResolvedValueOnce({ data: [{ asset_id: ASSET_ID, status: "uploaded", metadata_matches: true, fence_version: 2 }], error: null })
      .mockResolvedValueOnce({ data: [{ asset_id: ASSET_ID, status: "verified", fence_version: 3 }], error: null });

    const settled = await databaseMediaAssetRegistry.completeUpload({
      assetId: ASSET_ID,
      leaseToken: LEASE_TOKEN,
      fenceVersion: 1,
      sha256: "b".repeat(64),
      sizeBytes: 456,
      mimeType: "image/png",
      width: 20,
      height: 30,
    });
    await databaseMediaAssetRegistry.verifyAsset({ assetId: ASSET_ID, fenceVersion: settled.fenceVersion });

    expect(rpc).toHaveBeenNthCalledWith(1, "complete_media_asset_upload", {
      p_asset_id: ASSET_ID,
      p_lease_token: LEASE_TOKEN,
      p_fence_version: 1,
      p_sha256: "b".repeat(64),
      p_size_bytes: 456,
      p_mime_type: "image/png",
      p_width: 20,
      p_height: 30,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "verify_media_asset", {
      p_asset_id: ASSET_ID,
      p_fence_version: 2,
    });
  });

  it("quarantines a failed upload without persisting raw exception text", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    await databaseMediaAssetRegistry.failUpload({
      assetId: ASSET_ID,
      leaseToken: LEASE_TOKEN,
      fenceVersion: 1,
      errorCode: "Unsafe content with secret=value",
    });
    expect(rpc).toHaveBeenCalledWith("fail_media_asset_upload", expect.objectContaining({
      p_error: "unsafe_content_with_secret_value",
    }));
  });

  it("preserves safe RPC diagnostics without exposing secret-bearing text", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: "54000",
        message: "null character not permitted api_key=do-not-log https://private.example/path",
      },
    });

    const error = await databaseMediaAssetRegistry.createUpload({
      ownerUserId: "33333333-3333-4333-8333-333333333333",
      idempotencyKey: "upload:v1:image:hash",
      objectKey: "user-uploads/original/key.jpg",
      purpose: "reference-image",
      expectedSha256: "a".repeat(64),
      expectedSizeBytes: 123,
      expectedMimeType: "image/jpeg",
      leaseSeconds: 300,
      bucketName: "private-upload-bucket",
    }).catch((value: unknown) => value);

    const registryError = error as MediaAssetRegistryError;
    expect(registryError).toBeInstanceOf(MediaAssetRegistryError);
    expect(registryError).toMatchObject({ code: "54000", retryable: false });
    expect(registryError.message).toBe("media asset registry create failed [54000]");
    expect(registryError.diagnostic).toContain("null character not permitted");
    expect(registryError.diagnostic).not.toContain("do-not-log");
    expect(registryError.diagnostic).not.toContain("private.example");
  });
});
