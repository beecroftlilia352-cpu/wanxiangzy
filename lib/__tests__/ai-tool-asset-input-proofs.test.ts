import { describe, expect, it } from "vitest";
import {
  assetInputProof,
  assetReferenceProof,
  getUploadOwnershipProof,
} from "@/features/ai-tools/asset-input-proofs";
import type { UploadResult } from "@/lib/utils";

const BASE_UPLOAD: UploadResult = {
  url: "https://oss.example.com/upload/source.png",
  display_url: "https://oss.example.com/upload/source.png",
  delete_url: "",
  width: 1200,
  height: 1600,
};

describe("AI tool client asset proofs", () => {
  it("prefers an owned resource asset id over the fallback registration token", () => {
    const proof = getUploadOwnershipProof({
      ...BASE_UPLOAD,
      asset: { id: "12fd7fb7-c39e-4e82-98eb-6f35630a0f93" },
      resource_registration_token: "signed-upload-token",
    });

    expect(assetInputProof(proof, "source")).toEqual({
      source_asset_id: "12fd7fb7-c39e-4e82-98eb-6f35630a0f93",
    });
    expect(assetReferenceProof(proof)).toEqual({
      reference_asset_ids: ["12fd7fb7-c39e-4e82-98eb-6f35630a0f93"],
    });
  });

  it("falls back to the signed upload registration token when registration failed", () => {
    const proof = getUploadOwnershipProof({
      ...BASE_UPLOAD,
      resource_registration_token: "signed-upload-token",
    });

    expect(assetInputProof(proof, "source")).toEqual({ source_ref: "signed-upload-token" });
    expect(assetReferenceProof(proof)).toEqual({ reference_refs: ["signed-upload-token"] });
  });

  it("does not trust a malformed asset id", () => {
    const proof = getUploadOwnershipProof({ ...BASE_UPLOAD, asset: { id: "asset-1" } });

    expect(proof).toEqual({ assetId: null, registrationToken: null });
    expect(assetInputProof(proof, "source")).toEqual({});
  });
});
