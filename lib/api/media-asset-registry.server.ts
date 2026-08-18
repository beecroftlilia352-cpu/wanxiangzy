import { getAdminClient } from "@/lib/supabase/admin";

export type MediaAssetUploadLease = {
  assetId: string;
  status: "pending" | "uploaded" | "verified" | "quarantined" | "deleted";
  objectKey: string;
  leaseToken: string | null;
  fenceVersion: number;
  leaseExpiresAt: string | null;
  replayed: boolean;
};

export type MediaAssetSettlement = {
  assetId: string;
  status: "uploaded" | "verified" | "quarantined";
  metadataMatches: boolean;
  fenceVersion: number;
};

export type MediaAssetRegistry = {
  createUpload(input: {
    ownerUserId: string;
    idempotencyKey: string;
    objectKey: string;
    purpose: string;
    expectedSha256: string;
    expectedSizeBytes: number;
    expectedMimeType: string;
    leaseSeconds: number;
    bucketName: string;
  }): Promise<MediaAssetUploadLease>;
  completeUpload(input: {
    assetId: string;
    leaseToken: string;
    fenceVersion: number;
    sha256: string;
    sizeBytes: number;
    mimeType: string;
    width?: number;
    height?: number;
  }): Promise<MediaAssetSettlement>;
  verifyAsset(input: { assetId: string; fenceVersion: number }): Promise<{
    assetId: string;
    status: "verified";
    fenceVersion: number;
  }>;
  failUpload(input: {
    assetId: string;
    leaseToken: string;
    fenceVersion: number;
    errorCode: string;
  }): Promise<void>;
};

export class MediaAssetRegistryError extends Error {
  constructor(public readonly operation: "create" | "complete" | "verify" | "fail") {
    super(`media asset registry ${operation} failed`);
    this.name = "MediaAssetRegistryError";
  }
}

type RpcResult = { data: unknown; error: unknown };

/**
 * Service-role-only adapter around the fenced media asset lifecycle RPCs.
 * Keep exact RPC parameter names in one place so upload code cannot silently
 * bypass the canonical asset ledger.
 */
export const databaseMediaAssetRegistry: MediaAssetRegistry = {
  async createUpload(input) {
    const result = await callRpc("create", "create_media_asset_upload", {
      p_owner_user_id: input.ownerUserId,
      p_idempotency_key: input.idempotencyKey,
      p_object_key: input.objectKey,
      p_purpose: normalizeRegistryPurpose(input.purpose),
      p_visibility: "private",
      p_storage_class: "standard",
      p_expected_sha256: input.expectedSha256,
      p_expected_size_bytes: input.expectedSizeBytes,
      p_expected_mime_type: input.expectedMimeType,
      p_expected_width: null,
      p_expected_height: null,
      p_retention_until: null,
      p_lease_seconds: input.leaseSeconds,
      p_bucket_name: input.bucketName,
    });
    const row = firstRow(result, "create");
    return {
      assetId: requiredUuid(row.asset_id, "create"),
      status: requiredStatus(row.status, "create"),
      objectKey: requiredString(row.object_key, "create"),
      leaseToken: nullableUuid(row.lease_token, "create"),
      fenceVersion: requiredFence(row.fence_version, "create"),
      leaseExpiresAt: nullableString(row.lease_expires_at, "create"),
      replayed: row.replayed === true,
    };
  },

  async completeUpload(input) {
    const result = await callRpc("complete", "complete_media_asset_upload", {
      p_asset_id: input.assetId,
      p_lease_token: input.leaseToken,
      p_fence_version: input.fenceVersion,
      p_sha256: input.sha256,
      p_size_bytes: input.sizeBytes,
      p_mime_type: input.mimeType,
      p_width: input.width ?? null,
      p_height: input.height ?? null,
    });
    const row = firstRow(result, "complete");
    return {
      assetId: requiredUuid(row.asset_id, "complete"),
      status: requiredSettlementStatus(row.status, "complete"),
      metadataMatches: row.metadata_matches === true,
      fenceVersion: requiredFence(row.fence_version, "complete"),
    };
  },

  async verifyAsset(input) {
    const result = await callRpc("verify", "verify_media_asset", {
      p_asset_id: input.assetId,
      p_fence_version: input.fenceVersion,
    });
    const row = firstRow(result, "verify");
    if (row.status !== "verified") throw new MediaAssetRegistryError("verify");
    return {
      assetId: requiredUuid(row.asset_id, "verify"),
      status: "verified",
      fenceVersion: requiredFence(row.fence_version, "verify"),
    };
  },

  async failUpload(input) {
    const result = await callRpc("fail", "fail_media_asset_upload", {
      p_asset_id: input.assetId,
      p_lease_token: input.leaseToken,
      p_fence_version: input.fenceVersion,
      p_error: sanitizeFailureCode(input.errorCode),
    });
    if (result.error || result.data !== true) throw new MediaAssetRegistryError("fail");
  },
};

async function callRpc(
  operation: MediaAssetRegistryError["operation"],
  functionName: string,
  args: Record<string, unknown>,
): Promise<RpcResult> {
  try {
    return await getAdminClient().rpc(functionName, args) as unknown as RpcResult;
  } catch {
    throw new MediaAssetRegistryError(operation);
  }
}

function firstRow(result: RpcResult, operation: MediaAssetRegistryError["operation"]): Record<string, unknown> {
  if (result.error || !Array.isArray(result.data) || !result.data[0] || typeof result.data[0] !== "object") {
    throw new MediaAssetRegistryError(operation);
  }
  return result.data[0] as Record<string, unknown>;
}

function requiredStatus(value: unknown, operation: MediaAssetRegistryError["operation"]): MediaAssetUploadLease["status"] {
  if (value === "pending" || value === "uploaded" || value === "verified" || value === "quarantined" || value === "deleted") return value;
  throw new MediaAssetRegistryError(operation);
}

function requiredSettlementStatus(value: unknown, operation: MediaAssetRegistryError["operation"]): MediaAssetSettlement["status"] {
  if (value === "uploaded" || value === "verified" || value === "quarantined") return value;
  throw new MediaAssetRegistryError(operation);
}

function requiredString(value: unknown, operation: MediaAssetRegistryError["operation"]): string {
  if (typeof value === "string" && value.length > 0) return value;
  throw new MediaAssetRegistryError(operation);
}

function nullableString(value: unknown, operation: MediaAssetRegistryError["operation"]): string | null {
  if (value === null) return null;
  return requiredString(value, operation);
}

function requiredUuid(value: unknown, operation: MediaAssetRegistryError["operation"]): string {
  const normalized = requiredString(value, operation).toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)) return normalized;
  throw new MediaAssetRegistryError(operation);
}

function nullableUuid(value: unknown, operation: MediaAssetRegistryError["operation"]): string | null {
  if (value === null) return null;
  return requiredUuid(value, operation);
}

function requiredFence(value: unknown, operation: MediaAssetRegistryError["operation"]): number {
  const fence = Number(value);
  if (Number.isSafeInteger(fence) && fence >= 1) return fence;
  throw new MediaAssetRegistryError(operation);
}

function normalizeRegistryPurpose(value: string) {
  const purpose = value.replace(/-/g, "_");
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(purpose)) throw new MediaAssetRegistryError("create");
  return purpose;
}

function sanitizeFailureCode(value: string) {
  const code = value.trim().toLowerCase().replace(/[^a-z0-9_.:-]/g, "_").slice(0, 120);
  return code || "upload_validation_failed";
}
