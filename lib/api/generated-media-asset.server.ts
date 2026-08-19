import { createHash } from "node:crypto";

import {
  databaseMediaAssetRegistry,
  type MediaAssetRegistry,
} from "@/lib/api/media-asset-registry.server";
import { getAdminClient } from "@/lib/supabase/admin";
import { parseGenerationIdFromResultRef } from "@/lib/api/oss-mirror-transfer";

export type StoredGeneratedObject = {
  object_key?: string;
  bucket_name?: string;
  content_type?: string;
  size_bytes?: number;
  sha256?: string;
  width: number;
  height: number;
};

/** Register an already uploaded immutable generated object and return only its
 * canonical application URL. Signed/raw OSS URLs are never business data. */
export async function canonicalizeStoredGeneratedObject(
  stored: StoredGeneratedObject,
  generationRef: string,
  options: { registry?: MediaAssetRegistry; waitTimeoutMs?: number } = {},
) {
  const objectKey = stored.object_key || "";
  const bucketName = stored.bucket_name || "";
  const mimeType = stored.content_type || "";
  const sha256 = stored.sha256 || "";
  const sizeBytes = Number(stored.size_bytes);
  if (!objectKey || !bucketName || !/^(image|video|audio)\/[a-z0-9.+-]+$/.test(mimeType)
      || !/^[0-9a-f]{64}$/.test(sha256) || !Number.isSafeInteger(sizeBytes) || sizeBytes < 1) {
    throw new Error("generated object storage did not return verifiable OSS metadata");
  }
  const ownerUserId = await resolveOwner(generationRef);
  const registry = options.registry ?? databaseMediaAssetRegistry;
  const idempotencyKey = `generated:${createHash("sha256")
    .update(`${ownerUserId}\0${objectKey}\0${sha256}`).digest("hex")}`;
  const lease = await registry.createUpload({
    ownerUserId,
    idempotencyKey,
    objectKey,
    purpose: "generation_result",
    expectedSha256: sha256,
    expectedSizeBytes: sizeBytes,
    expectedMimeType: mimeType,
    leaseSeconds: 900,
    bucketName,
  });

  let status = lease.status;
  let fenceVersion = lease.fenceVersion;
  if (status === "pending") {
    if (!lease.leaseToken) throw new Error("generated media registry returned no upload fence");
    const completed = await registry.completeUpload({
      assetId: lease.assetId,
      leaseToken: lease.leaseToken,
      fenceVersion,
      sha256,
      sizeBytes,
      mimeType,
      width: stored.width > 0 ? stored.width : undefined,
      height: stored.height > 0 ? stored.height : undefined,
    });
    if (!completed.metadataMatches) throw new Error("generated object metadata was quarantined");
    status = completed.status;
    fenceVersion = completed.fenceVersion;
  }

  if (status === "quarantined" || status === "deleted") {
    throw new Error(`generated object registry status is ${status}`);
  }
  if (status !== "verified") {
    if (mimeType.startsWith("video/")) {
      await waitForVerified(lease.assetId, ownerUserId, options.waitTimeoutMs ?? 240_000);
    } else {
      const verified = await registry.verifyAsset({ assetId: lease.assetId, fenceVersion });
      if (verified.status !== "verified") throw new Error("generated object verification did not settle");
    }
  }
  return `/api/media-assets/${lease.assetId}`;
}

async function resolveOwner(generationRef: string) {
  const generationId = parseGenerationIdFromResultRef(generationRef);
  if (!generationId) throw new Error("generated object reference does not start with a generation UUID");
  const { data, error } = await getAdminClient().from("generations").select("user_id").eq("id", generationId).maybeSingle();
  if (error) throw new Error(`generated object owner lookup failed: ${error.message}`);
  const userId = String(data?.user_id || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    throw new Error("generated object owner is missing");
  }
  return userId;
}

async function waitForVerified(assetId: string, ownerUserId: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data, error } = await getAdminClient().rpc("get_media_asset_status", {
      p_asset_id: assetId,
      p_expected_owner_user_id: ownerUserId,
    });
    if (error) throw new Error(`generated video validation status failed: ${error.message}`);
    const row = Array.isArray(data) && data[0] && typeof data[0] === "object"
      ? data[0] as Record<string, unknown>
      : null;
    if (row?.status === "verified") return;
    if (row?.status === "quarantined" || row?.status === "deleted") {
      throw new Error(`generated video registry status is ${String(row.status)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("generated video validation did not complete before the publish deadline");
}
