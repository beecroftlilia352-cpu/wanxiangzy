import type { UploadResult } from "@/lib/utils";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AiToolClientAssetProof = {
  assetId: string | null;
  registrationToken: string | null;
};

export function getUploadOwnershipProof(upload: UploadResult): AiToolClientAssetProof {
  const assetId = readString(upload.media_asset_id)
    || readString(asRecord(upload.asset)?.id);
  return {
    assetId: assetId && UUID_PATTERN.test(assetId) ? assetId : null,
    registrationToken: readString(upload.resource_registration_token) || null,
  };
}

export function assetInputProof(asset: AiToolClientAssetProof, role: "source") {
  if (asset.assetId) return { [`${role}_asset_id`]: asset.assetId };
  if (asset.registrationToken) return { [`${role}_ref`]: asset.registrationToken };
  return {};
}

export function assetReferenceProof(asset: AiToolClientAssetProof) {
  if (asset.assetId) return { reference_asset_ids: [asset.assetId] };
  if (asset.registrationToken) return { reference_refs: [asset.registrationToken] };
  return {};
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
