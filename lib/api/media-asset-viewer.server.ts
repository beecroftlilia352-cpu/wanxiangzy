import { getAdminAccess } from "@/lib/admin/auth";
import { hasAdminPermission } from "@/lib/admin/permissions";
import { getAdminClient } from "@/lib/supabase/admin";

type ResolvedMediaAsset = {
  bucketName: string;
  objectKey: string;
  mimeType?: string;
};

export async function resolveVerifiedMediaAssetForViewer(
  assetId: string,
  viewerUserId: string,
): Promise<ResolvedMediaAsset | null> {
  const admin = getAdminClient();
  const owned = await admin.rpc("resolve_verified_media_asset_for_worker", {
    p_asset_id: assetId,
    p_expected_owner_user_id: viewerUserId,
  });
  const ownedRow = readResolvedRow(owned.data);
  if (!owned.error && ownedRow) return ownedRow;

  const access = await getAdminAccess();
  if (!access.ok || !hasAdminPermission(access.context.role, "tasks:read")) return null;

  const crossOwner = await admin.rpc("resolve_media_asset_object", { p_asset_id: assetId });
  const row = Array.isArray(crossOwner.data) && crossOwner.data[0] && typeof crossOwner.data[0] === "object"
    ? crossOwner.data[0] as { object_key?: unknown; status?: unknown; mime_type?: unknown }
    : null;
  const bucketName = process.env.ALIYUN_OSS_BUCKET?.trim();
  if (
    crossOwner.error
    || !row
    || row.status !== "verified"
    || typeof row.object_key !== "string"
    || !bucketName
  ) {
    return null;
  }
  return {
    bucketName,
    objectKey: row.object_key,
    mimeType: typeof row.mime_type === "string" ? row.mime_type : undefined,
  };
}

function readResolvedRow(data: unknown): ResolvedMediaAsset | null {
  const row = Array.isArray(data) && data[0] && typeof data[0] === "object"
    ? data[0] as { bucket_name?: unknown; object_key?: unknown; mime_type?: unknown }
    : null;
  if (!row || typeof row.bucket_name !== "string" || typeof row.object_key !== "string") return null;
  return {
    bucketName: row.bucket_name,
    objectKey: row.object_key,
    mimeType: typeof row.mime_type === "string" ? row.mime_type : undefined,
  };
}
