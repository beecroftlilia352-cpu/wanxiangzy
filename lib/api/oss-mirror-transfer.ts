import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { decryptProviderSecret, encryptProviderSecret } from "@/lib/api/model-provider-secrets";
import {
  assertRemoteImageUrlAllowed,
  fetchRemoteImageResponse,
  RemoteImageFetchError,
} from "@/lib/api/remote-image-fetch";
import { getAdminClient } from "@/lib/supabase/admin";
import { sanitizeGenerationErrorMessage } from "@/lib/api/generation-errors";

const MIRROR_TABLE = "oss_mirror_transfers";
const DEFAULT_MIRROR_TTL_SECONDS = 30 * 60;
const DEFAULT_PREFLIGHT_TIMEOUT_MS = 12_000;
const DEFAULT_TRIGGER_TIMEOUT_MS = 45_000;
const DEFAULT_WAIT_TIMEOUT_MS = 4 * 60_000;
const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_ATTEMPTS = 8;
const DEFAULT_RETRY_BASE_MS = 750;
const DEFAULT_NETWORK_CONCURRENCY = 8;
const DEFAULT_STREAM_TIMEOUT_MS = 120_000;
const MIRROR_LEASE_MS = 8 * 60_000;
const STREAM_LEASE_GRACE_MS = 30_000;
const SOURCE_PROBE_BYTES = 64;
const MAGIC_PROBE_BYTES = 12;

export type AliyunOssRemoteTransferMode = "disabled" | "mirror" | "stream";

type AdminClient = ReturnType<typeof getAdminClient>;
type MirrorStatus = "pending" | "processing" | "completed" | "failed";

type MirrorTransferRow = {
  id: string;
  object_key: string;
  source_url_ciphertext: string | null;
  source_url_sha256: string | null;
  source_host: string;
  generation_ref: string;
  owner_user_id: string | null;
  media_asset_id: string | null;
  transfer_mode: "mirror" | "stream";
  status: MirrorStatus;
  attempts: number;
  lease_token: string | null;
  lease_version: number;
  lease_expires_at: string | null;
  next_attempt_at: string;
  expires_at: string;
  expected_content_length: number | string | null;
  expected_content_type: string | null;
  content_length: number | string | null;
  content_type: string | null;
  last_error: string | null;
  resolver_hits: number;
  last_resolved_at: string | null;
};

type MirrorResult = {
  contentLength: number;
  contentType: SupportedImageType;
  contentSha256: string;
  checksumKind: "sha256" | "oss-etag" | "oss-crc64";
  etag: string | null;
  width?: number;
  height?: number;
};
type MirrorExpected = Pick<MirrorResult, "contentLength" | "contentType">;

type SupportedImageType =
  | "audio/aac"
  | "audio/mp4"
  | "audio/mpeg"
  | "audio/wav"
  | "image/avif"
  | "image/gif"
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "video/mp4"
  | "video/quicktime"
  | "video/webm";

type MirrorConfig = ReturnType<typeof getMirrorConfig>;

export class OssMirrorTransferError extends Error {
  constructor(message: string, public readonly retryable: boolean) {
    super(sanitizeGenerationErrorMessage(message, "OSS mirror transfer failed", 500));
    this.name = "OssMirrorTransferError";
  }
}

export function isAliyunOssMirrorEnabled() {
  return getAliyunOssRemoteTransferMode() === "mirror";
}

export function isAliyunOssRemoteTransferEnabled() {
  return getAliyunOssRemoteTransferMode() !== "disabled";
}

export function getAliyunOssRemoteTransferMode(): AliyunOssRemoteTransferMode {
  if ((process.env.IMAGE_STORAGE_PROVIDER || "").trim().toLowerCase() !== "aliyun-oss") {
    if (process.env.NODE_ENV === "production") {
      throw new Error("production generated results require IMAGE_STORAGE_PROVIDER=aliyun-oss");
    }
    return "disabled";
  }
  const configured = (process.env.ALIYUN_OSS_REMOTE_TRANSFER_MODE || "").trim().toLowerCase();
  if (configured === "stream" || configured === "mirror" || configured === "disabled") {
    if (configured === "disabled" && process.env.NODE_ENV === "production") {
      throw new Error("production generated results require ALIYUN_OSS_REMOTE_TRANSFER_MODE=stream|mirror");
    }
    return configured;
  }
  if (process.env.NODE_ENV === "production") return "stream";
  return /^(1|true|yes)$/i.test((process.env.ALIYUN_OSS_MIRROR_ENABLED || "").trim())
    ? "mirror"
    : "disabled";
}

/**
 * Persist a provider URL through OSS mirror back-to-origin. This call only
 * returns after OSS has stored and verified the complete object. EC2 reads at
 * most a 64-byte source probe and the one-byte OSS trigger response.
 */
export async function mirrorRemoteImageToAliyunOss(
  sourceUrl: string,
  generationRef: string,
  admin: AdminClient = getAdminClient(),
) {
  const transferMode = getAliyunOssRemoteTransferMode();
  if (transferMode === "disabled") throw terminalError("OSS remote transfer is disabled");
  const config = getMirrorConfig();
  if (sourceUrl.length > 8_000) throw terminalError("OSS mirror source URL is too long");
  const normalizedGenerationRef = generationRef.trim().slice(0, 240);
  if (!normalizedGenerationRef) throw terminalError("OSS mirror generation reference is empty");

  const source = new URL(sourceUrl);
  const expected = await inspectRemoteImage(source, config);
  const id = randomUUID();
  const now = Date.now();
  const expiresAtMs = now + config.ttlSeconds * 1000;
  const objectKey = buildMirrorObjectKey(
    config.mirrorPrefix,
    id,
    expiresAtMs,
    expected.contentType,
    config.signingSecret,
  );

  const row = await registerTransfer(admin, transferMode, {
    id,
    objectKey,
    sourceUrl: source.toString(),
    sourceHost: source.hostname.toLowerCase(),
    generationRef: normalizedGenerationRef,
    expected,
    expiresAt: new Date(expiresAtMs).toISOString(),
  });

  const completed = await waitForTransferCompletion(
    admin,
    row,
    config,
  );
  const mediaAssetId = String(completed.media_asset_id || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(mediaAssetId)) {
    throw retryableError("OSS mirror completed without a verified media asset");
  }
  return `/api/media-assets/${mediaAssetId}`;
}

/** Same durable transfer contract for provider video/audio results. */
export const mirrorRemoteMediaToAliyunOss = mirrorRemoteImageToAliyunOss;

/** Claim and process retryable rows. Safe to run in multiple worker processes. */
export async function processPendingOssMirrorTransfers(
  limit = 50,
  admin: AdminClient = getAdminClient(),
) {
  if (!isAliyunOssRemoteTransferEnabled()) {
    return { claimed: 0, completed: 0, deferred: 0, failed: 0 };
  }

  const config = getMirrorConfig();
  const { data, error } = await admin.rpc("claim_oss_mirror_transfers", {
    // Never lease more rows than this process can actively stream. Otherwise
    // queued rows can lose their lease before backpressure lets them start.
    p_limit: Math.min(clampInt(limit, 1, 100, 50), config.networkConcurrency),
    p_lease_seconds: Math.ceil(getTransferLeaseMs(config) / 1_000),
    p_worker_id: `oss-mirror-${process.pid}`,
  });
  if (error) throw retryableError(`claim OSS mirror mappings failed: ${error.message}`);

  const rows = asRows(data);
  const outcomes = await Promise.all(rows.map(async (row) => {
    try {
      await processOwnedTransfer(admin, row, config);
      return "completed" as const;
    } catch (error) {
      const updated = await deferOwnedTransfer(admin, row, config, error);
      if (updated.status === "completed") return "completed" as const;
      return updated.status === "failed" ? "failed" as const : "deferred" as const;
    }
  }));

  return {
    claimed: rows.length,
    completed: outcomes.filter((value) => value === "completed").length,
    deferred: outcomes.filter((value) => value === "deferred").length,
    failed: outcomes.filter((value) => value === "failed").length,
  };
}

/** Fail expired source capabilities so signed provider URLs are erased. */
export async function expireOssMirrorTransfers(
  limit = 500,
  admin: AdminClient = getAdminClient(),
) {
  if (!isAliyunOssRemoteTransferEnabled()) return 0;
  const { data, error } = await admin.rpc("expire_oss_mirror_transfers", {
    p_limit: clampInt(limit, 1, 1_000, 500),
  });
  if (error) throw retryableError(`expire OSS mirror mappings failed: ${error.message}`);
  return asRows(data).length;
}

/** Retain short operational history without deleting successfully stored OSS objects. */
export async function cleanupOssMirrorTransfers(
  admin: AdminClient = getAdminClient(),
) {
  if (!isAliyunOssRemoteTransferEnabled()) return { metadataDeleted: 0, failedObjectsDeleted: 0 };
  const config = getMirrorConfig();
  const now = Date.now();
  const completedBefore = new Date(now - config.completedRetentionDays * 86_400_000).toISOString();
  const failedBefore = new Date(now - config.failedRetentionDays * 86_400_000).toISOString();

  // Failed object names were never published. Delete any possible partial OSS
  // object before deleting its control-plane record. Concurrent DELETEs are safe.
  const { data: failedRows, error: failedReadError } = await admin
    .from(MIRROR_TABLE)
    .select("id,object_key")
    .eq("status", "failed")
    .lt("updated_at", failedBefore)
    .limit(500);
  if (failedReadError) throw retryableError(`read failed OSS mirror cleanup rows failed: ${failedReadError.message}`);

  let failedObjectsDeleted = 0;
  await Promise.all((failedRows || []).map(async (row) => {
    const deleted = await deleteOssObject(config, String(row.object_key));
    if (!deleted) return;
    const { error } = await admin.from(MIRROR_TABLE).delete().eq("id", row.id).eq("status", "failed");
    if (!error) failedObjectsDeleted += 1;
  }));

  const { data, error } = await admin.rpc("cleanup_oss_mirror_transfers", {
    p_completed_before: completedBefore,
    // Failed rows are removed only after their unpublished object is deleted above.
    p_failed_before: "1970-01-01T00:00:00.000Z",
    p_limit: 1_000,
  });
  if (error) throw retryableError(`cleanup OSS mirror metadata failed: ${error.message}`);

  return { metadataDeleted: asRows(data).length, failedObjectsDeleted };
}

/**
 * Resolve a capability-signed object key for OSS Website back-to-origin.
 * No shared secret header is required, so no credential can be forwarded to
 * the upstream image provider by OSS.
 */
export async function resolveOssMirrorSource(
  objectKey: string,
  admin: AdminClient = getAdminClient(),
) {
  if (!isAliyunOssMirrorEnabled()) return null;
  const config = getMirrorConfig();
  if (!verifyMirrorObjectKey(objectKey, config)) return null;

  const { data, error } = await admin
    .from(MIRROR_TABLE)
    .select(
      "id,object_key,source_url_ciphertext,source_url_sha256,source_host,status,expires_at,expected_content_length,expected_content_type",
    )
    .eq("object_key", objectKey)
    .in("status", ["pending", "processing"])
    .maybeSingle();
  if (error) throw retryableError(`resolve OSS mirror mapping failed: ${error.message}`);
  if (!data?.source_url_ciphertext || !data.source_url_sha256) return null;
  if (new Date(data.expires_at).getTime() <= Date.now()) return null;

  const plaintext = decryptProviderSecret(String(data.source_url_ciphertext));
  if (!plaintext || sha256(plaintext) !== data.source_url_sha256) {
    throw terminalError("OSS mirror source capability could not be decrypted or authenticated");
  }

  const source = new URL(plaintext);
  if (source.hostname.toLowerCase() !== data.source_host) {
    throw terminalError("OSS mirror source host changed unexpectedly");
  }
  const inspected = await inspectRemoteImage(source, config);
  if (
    inspected.contentLength !== Number(data.expected_content_length)
    || inspected.contentType !== data.expected_content_type
  ) {
    throw terminalError("OSS mirror source changed after registration");
  }
  const { error: auditError } = await admin.rpc("record_oss_mirror_resolution", {
    p_id: data.id,
  });
  if (auditError) {
    console.warn(`[oss-mirror] resolver audit failed: ${auditError.message}`);
  }
  return source.toString();
}

/** Used by deployment health checks without exposing secrets or touching OSS. */
export function validateOssMirrorRuntimeConfig() {
  const config = getMirrorConfig();
  return {
    endpoint: config.endpoint,
    mirrorPrefix: config.mirrorPrefix,
    allowedHostCount: config.allowedHosts.length,
  };
}

async function registerTransfer(
  admin: AdminClient,
  transferMode: AliyunOssRemoteTransferMode,
  input: {
    id: string;
    objectKey: string;
    sourceUrl: string;
    sourceHost: string;
    generationRef: string;
    expected: MirrorExpected;
    expiresAt: string;
  },
) {
  const ownerUserId = await resolveGenerationOwnerUserId(admin, input.generationRef);
  const sharedParams = {
    p_id: input.id,
    p_object_key: input.objectKey,
    p_source_url_ciphertext: encryptProviderSecret(input.sourceUrl),
    p_source_url_sha256: sha256(input.sourceUrl),
    p_source_host: input.sourceHost,
    p_generation_ref: input.generationRef,
    p_owner_user_id: ownerUserId,
    p_expected_content_length: input.expected.contentLength,
    p_expected_content_type: input.expected.contentType,
    p_expires_at: input.expiresAt,
  };
  const { data, error } = await admin.rpc("register_oss_mirror_transfer", {
    ...sharedParams,
    p_transfer_mode: transferMode,
    p_max_attempts: getMirrorConfig().maxAttempts,
  });
  if (error) throw retryableError(`register OSS mirror mapping failed: ${error.message}`);
  const row = asRows(data)[0];
  if (!row) throw retryableError("register OSS mirror mapping returned no row");
  return row;
}

async function waitForTransferCompletion(
  admin: AdminClient,
  initialRow: MirrorTransferRow,
  config: MirrorConfig,
) {
  const deadline = Date.now() + config.waitTimeoutMs;
  let row = initialRow;

  while (Date.now() < deadline) {
    if (row.status === "completed") return row;
    if (row.status === "failed") {
      throw terminalError(`OSS remote transfer failed: ${row.last_error || "unknown failure"}`);
    }

    const nextAttemptAt = new Date(row.next_attempt_at).getTime();
    const waitMs = Math.max(100, Math.min(2_000, nextAttemptAt - Date.now()));
    await delay(waitMs);
    row = await readTransfer(admin, row.id);
  }

  throw retryableError("OSS mirror transfer did not complete within the publish timeout");
}

async function readTransfer(admin: AdminClient, id: string) {
  const { data, error } = await admin.from(MIRROR_TABLE).select("*").eq("id", id).maybeSingle();
  if (error) throw retryableError(`read OSS mirror mapping failed: ${error.message}`);
  if (!data) throw terminalError("OSS mirror mapping no longer exists");
  return data as MirrorTransferRow;
}

async function processOwnedTransfer(
  admin: AdminClient,
  row: MirrorTransferRow,
  config: MirrorConfig,
) {
  if (!row.lease_token || !Number.isInteger(row.lease_version)) {
    throw terminalError("OSS transfer is missing its lease fence");
  }
  let leaseLost = false;
  let heartbeatRunning = false;
  const heartbeat = async () => {
    if (heartbeatRunning || leaseLost) return;
    heartbeatRunning = true;
    try {
      const { data, error } = await admin.rpc("heartbeat_oss_mirror_transfer", {
        p_id: row.id,
        p_lease_token: row.lease_token,
        p_lease_version: row.lease_version,
        p_lease_seconds: Math.ceil(getTransferLeaseMs(config) / 1_000),
      });
      if (error || data !== true) leaseLost = true;
    } finally {
      heartbeatRunning = false;
    }
  };
  const timer = setInterval(() => void heartbeat(), 30_000);
  timer.unref?.();
  try {
    const result = await processOwnedTransferWithFence(admin, row, config);
    if (leaseLost) throw retryableError("OSS transfer lease was lost during processing");
    return result;
  } finally {
    clearInterval(timer);
  }
}

async function processOwnedTransferWithFence(
  admin: AdminClient,
  row: MirrorTransferRow,
  config: MirrorConfig,
) {
  let mirrored: MirrorResult;
  if (row.transfer_mode === "stream") {
    mirrored = await streamRemoteImageToOss(row, config);
  } else {
    try {
      await assertOssBucketPrivate(config);
      mirrored = await triggerMirrorTransfer(row, config);
    } catch (mirrorError) {
      // OSS Website mirror is the preferred data plane, but it is an optional
      // bucket capability and can be temporarily unavailable. Fall back to the
      // same SSRF-guarded, byte-bounded server stream under the active fence.
      console.warn("[oss-mirror] cloud pull failed; using bounded stream fallback", {
        transferId: row.id,
        error: mirrorError instanceof Error ? mirrorError.message : String(mirrorError),
      });
      mirrored = await streamRemoteImageToOss(row, config);
    }
  }
  await enforcePrivateOssObjectAcl(config, row.object_key);
  if (mirrored.contentType.startsWith("image/") || mirrored.checksumKind !== "sha256") {
    const hashed = await hashStoredOssObject(config, row.object_key, mirrored.contentLength, mirrored.contentType);
    mirrored = {
      ...mirrored,
      contentSha256: hashed.sha256,
      checksumKind: "sha256",
      width: hashed.width,
      height: hashed.height,
    };
  }
  const mediaAssetId = await registerVerifiedMirrorAsset(admin, row, config, mirrored);
  const { data, error } = await admin.rpc("complete_oss_mirror_transfer", {
    p_id: row.id,
    p_lease_token: row.lease_token,
    p_lease_version: row.lease_version,
    p_content_length: mirrored.contentLength,
    p_content_type: mirrored.contentType,
    p_content_sha256: mirrored.contentSha256,
    p_checksum_kind: mirrored.checksumKind,
    p_etag: mirrored.etag,
    p_media_asset_id: mediaAssetId,
  });
  if (error) throw retryableError(`complete OSS mirror mapping failed: ${error.message}`);
  const completed = asRows(data)[0];
  if (!completed) {
    const current = await readTransfer(admin, row.id);
    if (current.status === "completed") return current;
    throw retryableError("OSS mirror completion lease was lost");
  }
  return completed;
}

async function resolveGenerationOwnerUserId(admin: AdminClient, generationRef: string) {
  const generationId = parseGenerationIdFromResultRef(generationRef);
  if (!generationId) throw terminalError("OSS mirror generation reference does not start with a generation UUID");
  const { data, error } = await admin
    .from("generations")
    .select("user_id")
    .eq("id", generationId)
    .maybeSingle();
  if (error) throw retryableError(`resolve OSS mirror owner failed: ${error.message}`);
  const ownerUserId = String(data?.user_id || "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ownerUserId)) {
    throw terminalError("OSS mirror generation owner is missing");
  }
  return ownerUserId;
}

export function parseGenerationIdFromResultRef(generationRef: string) {
  return /^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:-|$)/i
    .exec(generationRef)?.[1] || null;
}

async function registerVerifiedMirrorAsset(
  admin: AdminClient,
  row: MirrorTransferRow,
  config: MirrorConfig,
  mirrored: MirrorResult,
) {
  const ownerUserId = row.owner_user_id || await resolveGenerationOwnerUserId(admin, row.generation_ref);
  const { data: createdData, error: createError } = await admin.rpc("create_media_asset_upload", {
    p_owner_user_id: ownerUserId,
    p_idempotency_key: `oss-mirror:${row.id}`,
    p_object_key: row.object_key,
    p_purpose: "generation_result",
    p_visibility: "private",
    p_storage_class: "standard",
    p_expected_sha256: mirrored.contentSha256,
    p_expected_size_bytes: mirrored.contentLength,
    p_expected_mime_type: mirrored.contentType,
    p_expected_width: mirrored.width ?? null,
    p_expected_height: mirrored.height ?? null,
    p_retention_until: null,
    p_lease_seconds: 900,
    p_bucket_name: config.bucket,
  });
  if (createError) throw retryableError(`register mirrored media asset failed: ${createError.message}`);
  const created = firstRecord(createdData);
  if (!created?.asset_id) throw retryableError("register mirrored media asset returned no asset");

  let status = String(created.status || "");
  let fenceVersion = Number(created.fence_version);
  if (status === "pending") {
    if (!created.lease_token || !Number.isSafeInteger(fenceVersion)) {
      throw retryableError("mirrored media asset returned an invalid upload fence");
    }
    const { data: completedData, error: completeError } = await admin.rpc("complete_media_asset_upload", {
      p_asset_id: created.asset_id,
      p_lease_token: created.lease_token,
      p_fence_version: fenceVersion,
      p_sha256: mirrored.contentSha256,
      p_size_bytes: mirrored.contentLength,
      p_mime_type: mirrored.contentType,
      p_width: mirrored.width ?? null,
      p_height: mirrored.height ?? null,
    });
    if (completeError) throw retryableError(`complete mirrored media asset failed: ${completeError.message}`);
    const completed = firstRecord(completedData);
    if (!completed?.asset_id) throw retryableError("complete mirrored media asset returned no asset");
    status = String(completed.status || "");
    fenceVersion = Number(completed.fence_version);
    if (completed.metadata_matches !== true) {
      throw terminalError("mirrored media asset metadata did not match its registration");
    }
  }

  if (status === "quarantined" || status === "deleted") {
    throw terminalError(`mirrored media asset is ${status}`);
  }
  if (status === "verified") return String(created.asset_id);

  if (mirrored.contentType.startsWith("video/")) {
    await waitForMediaAssetVerification(admin, String(created.asset_id), ownerUserId, config.waitTimeoutMs);
    return String(created.asset_id);
  }

  if (status !== "uploaded" || !Number.isSafeInteger(fenceVersion)) {
    throw retryableError(`mirrored media asset is not ready to verify: ${status || "unknown"}`);
  }
  const { data: verifiedData, error: verifyError } = await admin.rpc("verify_media_asset", {
    p_asset_id: created.asset_id,
    p_fence_version: fenceVersion,
  });
  if (verifyError) throw retryableError(`verify mirrored media asset failed: ${verifyError.message}`);
  const verified = firstRecord(verifiedData);
  if (verified?.status !== "verified") throw retryableError("mirrored media asset verification did not settle");
  return String(created.asset_id);
}

async function waitForMediaAssetVerification(
  admin: AdminClient,
  assetId: string,
  ownerUserId: string,
  timeoutMs: number,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data, error } = await admin.rpc("get_media_asset_status", {
      p_asset_id: assetId,
      p_expected_owner_user_id: ownerUserId,
    });
    if (error) throw retryableError(`read mirrored media asset status failed: ${error.message}`);
    const current = firstRecord(data);
    if (current?.status === "verified") return;
    if (current?.status === "quarantined" || current?.status === "deleted") {
      throw terminalError(`mirrored media asset is ${current.status}`);
    }
    await delay(500);
  }
  throw retryableError("mirrored media asset validation did not complete before the publish deadline");
}

async function hashStoredOssObject(
  config: MirrorConfig,
  objectKey: string,
  expectedLength: number,
  expectedType: SupportedImageType,
) {
  const response = await withNetworkPermit(config.networkConcurrency, () => fetch(
    buildObjectUrl(`https://${config.endpoint}`, objectKey),
    {
      method: "GET",
      cache: "no-store",
      redirect: "manual",
      headers: signOssRequest(config, "GET", objectKey, { "Accept-Encoding": "identity" }),
      signal: AbortSignal.timeout(config.streamTimeoutMs),
    },
  ));
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw httpError("OSS full-object checksum", response.status);
  }
  const storedLength = Number(response.headers.get("content-length") || 0);
  const storedType = normalizeSupportedImageType(response.headers.get("content-type"));
  if (storedLength !== expectedLength || storedType !== expectedType || !response.body) {
    await response.body?.cancel().catch(() => undefined);
    throw terminalError("OSS full-object metadata differs from the mirrored source");
  }

  const reader = response.body.getReader();
  const hash = createHash("sha256");
  const imageChunks: Buffer[] = [];
  let prefix = Buffer.alloc(0);
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > expectedLength || total > config.maxBytes) {
        throw terminalError("OSS full-object stream exceeded its validated size");
      }
      hash.update(value);
      if (expectedType.startsWith("image/")) imageChunks.push(Buffer.from(value));
      if (prefix.byteLength < SOURCE_PROBE_BYTES) {
        prefix = Buffer.concat([
          prefix,
          Buffer.from(value.subarray(0, SOURCE_PROBE_BYTES - prefix.byteLength)),
        ]);
      }
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
  if (total !== expectedLength || !matchesImageMagic(prefix, expectedType)) {
    throw terminalError("OSS full-object bytes failed length or media signature verification");
  }
  let dimensions: { width?: number; height?: number } = {};
  if (expectedType.startsWith("image/")) {
    try {
      const sharp = (await import("sharp")).default;
      const image = sharp(Buffer.concat(imageChunks, total), {
        failOn: "error",
        limitInputPixels: 40_000_000,
      });
      const metadata = await image.metadata();
      // stats() forces a complete pixel decode instead of trusting container
      // headers. libvips applies the pixel limit before allocating the raster.
      await image.stats();
      const width = Number(metadata.width);
      const height = Number(metadata.height);
      if (!Number.isInteger(width) || !Number.isInteger(height)
          || width < 1 || height < 1 || width > 12_000 || height > 12_000
          || width * height > 40_000_000) {
        throw new Error("image dimensions exceed the generated-result safety limits");
      }
      dimensions = { width, height };
    } catch (error) {
      throw terminalError(`OSS image decode verification failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { sha256: hash.digest("hex"), ...dimensions };
}

async function deferOwnedTransfer(
  admin: AdminClient,
  row: MirrorTransferRow,
  config: MirrorConfig,
  error: unknown,
) {
  const retryable = !(error instanceof OssMirrorTransferError) || error.retryable;
  const retryDelayMs = Math.min(
    60_000,
    config.retryBaseMs * Math.pow(2, Math.max(0, row.attempts - 1)),
  );
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 1_000);
  const { data, error: updateError } = await admin.rpc("defer_oss_mirror_transfer", {
    p_id: row.id,
    p_lease_token: row.lease_token,
    p_lease_version: row.lease_version,
    p_error: message,
    p_retryable: retryable,
    p_delay_seconds: Math.max(1, Math.ceil(retryDelayMs / 1_000)),
  });
  if (updateError) throw retryableError(`defer OSS mirror mapping failed: ${updateError.message}`);
  const updated = asRows(data)[0];
  if (updated) return updated;
  return readTransfer(admin, row.id);
}

async function streamRemoteImageToOss(
  row: MirrorTransferRow,
  config: MirrorConfig,
): Promise<MirrorResult> {
  if (!row.source_url_ciphertext || !row.source_url_sha256) {
    throw terminalError("OSS stream mapping has no encrypted source URL");
  }
  if (!row.lease_token || new Date(row.expires_at).getTime() <= Date.now()) {
    throw terminalError("OSS stream mapping is not actively leased");
  }

  const sourceUrl = decryptProviderSecret(row.source_url_ciphertext);
  if (!sourceUrl || sha256(sourceUrl) !== row.source_url_sha256) {
    throw terminalError("OSS stream source capability could not be decrypted or authenticated");
  }
  const source = new URL(sourceUrl);
  if (source.hostname.toLowerCase() !== row.source_host) {
    throw terminalError("OSS stream source host changed unexpectedly");
  }

  const expectedLength = Number(row.expected_content_length);
  const expectedType = normalizeSupportedImageType(row.expected_content_type);
  if (!Number.isSafeInteger(expectedLength) || expectedLength <= 0 || !expectedType) {
    throw terminalError("OSS stream mapping has invalid expected metadata");
  }

  const existing = await inspectStoredOssObject(config, row.object_key, expectedLength, expectedType);
  if (existing.status === "matching") return existing.result;
  if (existing.status === "mismatch") await deleteOssObject(config, row.object_key);

  let remote;
  try {
    remote = await withNetworkPermit(config.networkConcurrency, () => fetchRemoteImageResponse(
      source.toString(),
      {
        allowedHosts: config.allowedHosts,
        allowedContentTypes: ["audio", "image", "video"],
        maxBytes: config.maxBytes,
        timeoutMs: config.streamTimeoutMs,
        requestHeaders: { "Accept-Encoding": "identity" },
      },
    ));
  } catch (error) {
    throw classifyRemoteStreamError(error);
  }

  const actualType = normalizeSupportedImageType(remote.contentType);
  if (actualType !== expectedType || (remote.contentLength > 0 && remote.contentLength !== expectedLength)) {
    await remote.response.body?.cancel().catch(() => undefined);
    throw terminalError("remote image metadata changed before OSS stream upload");
  }
  if (!remote.response.body) throw retryableError("remote image stream body is empty");

  const validated = createValidatedImageStream(
    remote.response.body,
    expectedLength,
    expectedType,
    config.maxBytes,
  );
  const objectUrl = buildObjectUrl(`https://${config.endpoint}`, row.object_key);
  let response: Response;
  try {
    response = await withNetworkPermit(config.networkConcurrency, () => fetch(objectUrl, {
      method: "PUT",
      body: validated.body,
      cache: "no-store",
      redirect: "manual",
      headers: signOssRequest(config, "PUT", row.object_key, {
        "Content-Length": String(expectedLength),
        "Content-Type": expectedType,
        "x-oss-forbid-overwrite": "true",
        "x-oss-object-acl": "private",
      }),
      signal: AbortSignal.timeout(config.streamTimeoutMs),
      duplex: "half",
    } as RequestInit & { duplex: "half" }));
  } catch (error) {
    const recovered = await inspectStoredOssObject(config, row.object_key, expectedLength, expectedType)
      .catch(() => ({ status: "missing" as const }));
    if (recovered.status === "matching") return recovered.result;
    await deleteOssObject(config, row.object_key);
    if (error instanceof OssMirrorTransferError) throw error;
    throw retryableError(`OSS stream upload failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    await deleteOssObject(config, row.object_key);
    throw httpError("OSS stream upload", response.status);
  }
  if (validated.bytesRead() !== expectedLength) {
    await deleteOssObject(config, row.object_key);
    throw terminalError(`remote image stream length changed: ${validated.bytesRead()}/${expectedLength}`);
  }

  const contentSha256 = validated.contentSha256();
  const contentMd5 = validated.contentMd5();
  const stored = await inspectStoredOssObject(
    config,
    row.object_key,
    expectedLength,
    expectedType,
    undefined,
    contentMd5,
  );
  if (stored.status !== "matching") {
    await deleteOssObject(config, row.object_key);
    throw retryableError("OSS stream upload verification failed");
  }
  return { ...stored.result, contentSha256, checksumKind: "sha256" };
}

function createValidatedImageStream(
  source: ReadableStream<Uint8Array>,
  expectedLength: number,
  expectedType: SupportedImageType,
  maxBytes: number,
) {
  let totalBytes = 0;
  const contentHash = createHash("sha256");
  const md5Hash = createHash("md5");
  let prefix = Buffer.alloc(0);
  let pending: Uint8Array[] = [];
  let magicValidated = false;

  const body = source.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      totalBytes += chunk.byteLength;
      contentHash.update(chunk);
      md5Hash.update(chunk);
      if (totalBytes > maxBytes || totalBytes > expectedLength) {
        throw terminalError(`remote image stream exceeds ${Math.min(maxBytes, expectedLength)} bytes`);
      }

      if (magicValidated) {
        controller.enqueue(chunk);
        return;
      }

      pending.push(chunk);
      const needed = Math.max(0, MAGIC_PROBE_BYTES - prefix.byteLength);
      if (needed > 0) {
        prefix = Buffer.concat([
          prefix,
          Buffer.from(chunk.subarray(0, Math.min(needed, chunk.byteLength))),
        ]);
      }
      if (prefix.byteLength < MAGIC_PROBE_BYTES) return;

      if (!matchesImageMagic(prefix, expectedType)) {
        throw terminalError(`remote image stream bytes do not match ${expectedType}`);
      }
      magicValidated = true;
      for (const buffered of pending) controller.enqueue(buffered);
      pending = [];
    },
    flush(controller) {
      if (!magicValidated) {
        if (!matchesImageMagic(prefix, expectedType)) {
          throw terminalError(`remote image stream bytes do not match ${expectedType}`);
        }
        for (const buffered of pending) controller.enqueue(buffered);
      }
      if (totalBytes !== expectedLength) {
        throw terminalError(`remote image stream length changed: ${totalBytes}/${expectedLength}`);
      }
    },
  }));

  let digest: string | null = null;
  let md5Digest: string | null = null;
  return {
    body,
    bytesRead: () => totalBytes,
    contentSha256: () => {
      digest ??= contentHash.digest("hex");
      return digest;
    },
    contentMd5: () => {
      md5Digest ??= md5Hash.digest("hex");
      return md5Digest;
    },
  };
}

async function inspectStoredOssObject(
  config: MirrorConfig,
  objectKey: string,
  expectedLength: number,
  expectedType: SupportedImageType,
  expectedSha256?: string,
  expectedEtag?: string,
): Promise<{ status: "matching"; result: MirrorResult } | { status: "mismatch" | "missing" }> {
  const objectUrl = buildObjectUrl(`https://${config.endpoint}`, objectKey);
  const response = await withNetworkPermit(config.networkConcurrency, () => fetch(objectUrl, {
    method: "HEAD",
    cache: "no-store",
    redirect: "manual",
    headers: signOssRequest(config, "HEAD", objectKey),
    signal: AbortSignal.timeout(config.triggerTimeoutMs),
  }));
  if (response.status === 404) return { status: "missing" };
  if (!response.ok) throw httpError("OSS stream verification", response.status);
  const storedLength = Number(response.headers.get("content-length") || 0);
  const storedType = normalizeSupportedImageType(response.headers.get("content-type"));
  const metadataSha256 = (response.headers.get("x-oss-meta-sha256") || "").toLowerCase();
  const etag = (response.headers.get("etag") || "").replace(/^"|"$/g, "") || null;
  const crc64 = response.headers.get("x-oss-hash-crc64ecma") || null;
  const checksum = metadataSha256 || etag || crc64 || "";
  const checksumKind: MirrorResult["checksumKind"] = metadataSha256
    ? "sha256"
    : etag
      ? "oss-etag"
      : "oss-crc64";
  const matches = storedLength === expectedLength
    && storedType === expectedType
    && Boolean(checksum)
    && (!expectedSha256 || metadataSha256 === expectedSha256)
    && (!expectedEtag || etag?.toLowerCase() === expectedEtag.toLowerCase());
  return matches
    ? {
        status: "matching",
        result: {
          contentLength: storedLength,
          contentType: storedType!,
          contentSha256: checksum,
          checksumKind,
          etag,
        },
      }
    : { status: "mismatch" };
}

function classifyRemoteStreamError(error: unknown) {
  if (!(error instanceof RemoteImageFetchError)) {
    return retryableError(`remote image stream failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (error.code === "timeout" || error.code === "empty-body") {
    return retryableError(error.message);
  }
  if (error.code === "bad-status") {
    return httpError("remote image stream", error.status || 0);
  }
  return terminalError(error.message);
}

async function triggerMirrorTransfer(row: MirrorTransferRow, config: MirrorConfig): Promise<MirrorResult> {
  if (!row.source_url_ciphertext || !row.source_url_sha256) {
    throw terminalError("OSS mirror mapping has no encrypted source URL");
  }
  if (!row.lease_token || new Date(row.expires_at).getTime() <= Date.now()) {
    throw terminalError("OSS mirror mapping is not actively leased");
  }

  const sourceUrl = decryptProviderSecret(row.source_url_ciphertext);
  if (!sourceUrl || sha256(sourceUrl) !== row.source_url_sha256) {
    throw terminalError("OSS mirror source capability could not be decrypted or authenticated");
  }
  const source = new URL(sourceUrl);
  if (source.hostname.toLowerCase() !== row.source_host) {
    throw terminalError("OSS mirror source host changed unexpectedly");
  }

  const expectedLength = Number(row.expected_content_length);
  const expectedType = normalizeSupportedImageType(row.expected_content_type);
  if (!Number.isSafeInteger(expectedLength) || expectedLength <= 0 || !expectedType) {
    throw terminalError("OSS mirror mapping has invalid expected metadata");
  }

  const objectUrl = buildObjectUrl(`https://${config.endpoint}`, row.object_key);
  const response = await withNetworkPermit(config.networkConcurrency, () => fetch(objectUrl, {
    method: "GET",
    cache: "no-store",
    redirect: "manual",
    // OSS website routing (including Mirror back-to-origin) is evaluated for
    // anonymous object reads. An Authorization header turns this into a normal
    // signed GetObject request and a missing key returns NoSuchKey directly.
    // The bucket already serves generated results publicly; the unguessable,
    // short-lived object capability is what authorizes the resolver lookup.
    headers: { Range: "bytes=0-0" },
    signal: AbortSignal.timeout(config.triggerTimeoutMs),
  }));

  if (response.status !== 206) {
    await response.body?.cancel().catch(() => undefined);
    throw httpError("OSS mirror Range trigger", response.status);
  }

  const match = /^bytes 0-0\/(\d+)$/.exec(response.headers.get("content-range") || "");
  if (!match) {
    await response.body?.cancel().catch(() => undefined);
    throw terminalError("OSS mirror did not honor the one-byte Range request");
  }

  const triggerBody = await readResponsePrefix(response, 2);
  if (triggerBody.byteLength !== 1) {
    await deleteOssObject(config, row.object_key);
    throw terminalError("OSS mirror trigger returned an invalid body length");
  }

  const contentLength = Number(match[1]);
  const contentType = normalizeSupportedImageType(response.headers.get("content-type"));
  if (contentLength !== expectedLength || contentType !== expectedType) {
    await deleteOssObject(config, row.object_key);
    throw terminalError("OSS mirror response metadata differs from the validated source");
  }

  const head = await withNetworkPermit(config.networkConcurrency, () => fetch(objectUrl, {
    method: "HEAD",
    cache: "no-store",
    redirect: "manual",
    headers: signOssRequest(config, "HEAD", row.object_key),
    signal: AbortSignal.timeout(config.triggerTimeoutMs),
  }));
  const storedLength = Number(head.headers.get("content-length") || 0);
  const storedType = normalizeSupportedImageType(head.headers.get("content-type"));
  if (!head.ok || storedLength !== expectedLength || storedType !== expectedType) {
    await deleteOssObject(config, row.object_key);
    throw retryableError(
      `OSS mirror verification failed: HEAD ${head.status}, size ${storedLength}/${expectedLength}`,
    );
  }

  const metadataSha256 = (head.headers.get("x-oss-meta-sha256") || "").toLowerCase();
  const etag = (head.headers.get("etag") || "").replace(/^"|"$/g, "") || null;
  const crc64 = head.headers.get("x-oss-hash-crc64ecma") || null;
  const checksum = metadataSha256 || etag || crc64;
  if (!checksum) throw retryableError("OSS mirror HEAD did not return an integrity checksum");
  return {
    contentLength: expectedLength,
    contentType: expectedType,
    contentSha256: checksum,
    checksumKind: metadataSha256 ? "sha256" : etag ? "oss-etag" : "oss-crc64",
    etag,
  };
}

async function inspectRemoteImage(source: URL, config: MirrorConfig): Promise<MirrorExpected> {
  if (source.username || source.password || source.hash || (source.port && source.port !== "443")) {
    throw terminalError("remote image URL credentials, fragments, and non-HTTPS ports are not allowed");
  }
  try {
    await assertRemoteImageUrlAllowed(source, { allowedHosts: config.allowedHosts });
  } catch (error) {
    throw terminalError(error instanceof Error ? error.message : "remote image URL is not allowed");
  }

  let response: Response;
  try {
    response = await withNetworkPermit(config.networkConcurrency, () => fetch(source, {
      method: "GET",
      cache: "no-store",
      redirect: "manual",
      headers: {
        "Accept-Encoding": "identity",
        Range: `bytes=0-${SOURCE_PROBE_BYTES - 1}`,
      },
      signal: AbortSignal.timeout(config.preflightTimeoutMs),
    }));
  } catch (error) {
    throw retryableError(`remote image preflight failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel().catch(() => undefined);
    throw terminalError("remote image redirects are not allowed for OSS mirror sources");
  }
  if (response.status !== 200 && response.status !== 206) {
    await response.body?.cancel().catch(() => undefined);
    throw httpError("remote image preflight", response.status);
  }

  const contentType = normalizeSupportedImageType(response.headers.get("content-type"));
  if (!contentType) {
    await response.body?.cancel().catch(() => undefined);
    throw terminalError("remote image has a missing or unsupported content type");
  }

  const contentLength = getRemoteTotalLength(response);
  if (!Number.isSafeInteger(contentLength) || contentLength <= 0) {
    await response.body?.cancel().catch(() => undefined);
    throw terminalError("remote image size is missing or invalid");
  }
  if (contentLength > config.maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw terminalError(`remote image exceeds ${config.maxBytes} bytes`);
  }

  const prefix = await readResponsePrefix(response, SOURCE_PROBE_BYTES);
  if (!matchesImageMagic(prefix, contentType)) {
    throw terminalError(`remote image bytes do not match ${contentType}`);
  }
  return { contentLength, contentType };
}

function getRemoteTotalLength(response: Response) {
  if (response.status === 206) {
    const match = /^bytes 0-(\d+)\/(\d+)$/.exec(response.headers.get("content-range") || "");
    if (!match || Number(match[1]) >= SOURCE_PROBE_BYTES) return 0;
    return Number(match[2]);
  }
  return Number(response.headers.get("content-length") || 0);
}

async function deleteOssObject(config: MirrorConfig, objectKey: string) {
  try {
    const response = await withNetworkPermit(config.networkConcurrency, () => fetch(
      buildObjectUrl(`https://${config.endpoint}`, objectKey),
      {
        method: "DELETE",
        redirect: "manual",
        headers: signOssRequest(config, "DELETE", objectKey),
        signal: AbortSignal.timeout(config.triggerTimeoutMs),
      },
    ));
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}

let privateBucketCheck: { endpoint: string; checkedAt: number } | null = null;

async function assertOssBucketPrivate(config: MirrorConfig) {
  if (privateBucketCheck?.endpoint === config.endpoint && Date.now() - privateBucketCheck.checkedAt < 60_000) return;
  const response = await withNetworkPermit(config.networkConcurrency, () => fetch(`https://${config.endpoint}/?acl`, {
    method: "GET",
    cache: "no-store",
    redirect: "manual",
    headers: signOssRequest(config, "GET", "", {}, "?acl"),
    signal: AbortSignal.timeout(config.triggerTimeoutMs),
  }));
  const body = await readResponseSnippet(response, 8_192);
  if (!response.ok) throw httpError("OSS bucket ACL verification", response.status);
  if (!/<Grant>private<\/Grant>/i.test(body)) {
    throw terminalError("OSS cloud mirror requires a private bucket ACL");
  }
  privateBucketCheck = { endpoint: config.endpoint, checkedAt: Date.now() };
}

async function enforcePrivateOssObjectAcl(config: MirrorConfig, objectKey: string) {
  const url = `${buildObjectUrl(`https://${config.endpoint}`, objectKey)}?acl`;
  const response = await withNetworkPermit(config.networkConcurrency, () => fetch(url, {
    method: "PUT",
    cache: "no-store",
    redirect: "manual",
    headers: signOssRequest(config, "PUT", objectKey, { "x-oss-object-acl": "private" }, "?acl"),
    signal: AbortSignal.timeout(config.triggerTimeoutMs),
  }));
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw httpError("OSS object private ACL", response.status);
  }
}

function signOssRequest(
  config: MirrorConfig,
  method: "DELETE" | "GET" | "HEAD" | "PUT",
  objectKey: string,
  extraHeaders: Record<string, string> = {},
  canonicalQuery = "",
) {
  const date = new Date().toUTCString();
  const signedHeaders: Record<string, string> = { ...extraHeaders };
  if (config.securityToken) signedHeaders["x-oss-security-token"] = config.securityToken;
  const contentTypeEntry = Object.entries(signedHeaders)
    .find(([name]) => name.toLowerCase() === "content-type");
  const contentType = contentTypeEntry?.[1] || "";
  const canonicalizedOssHeaders = Object.entries(signedHeaders)
    .map(([name, value]) => [name.toLowerCase(), value.trim()] as const)
    .filter(([name]) => name.startsWith("x-oss-"))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}:${value}\n`)
    .join("");
  const canonicalizedResource = `/${config.bucket}/${objectKey}${canonicalQuery}`;
  const signature = createHmac("sha1", config.accessKeySecret)
    .update([method, "", contentType, date, `${canonicalizedOssHeaders}${canonicalizedResource}`].join("\n"))
    .digest("base64");
  return {
    ...signedHeaders,
    Authorization: `OSS ${config.accessKeyId}:${signature}`,
    Date: date,
  };
}

function getMirrorConfig() {
  const accessKeyId = process.env.ALIYUN_OSS_ACCESS_KEY_ID?.trim();
  const accessKeySecret = process.env.ALIYUN_OSS_ACCESS_KEY_SECRET?.trim();
  const bucket = process.env.ALIYUN_OSS_BUCKET?.trim();
  const region = process.env.ALIYUN_OSS_REGION?.trim();
  const publicBaseUrl = validatePublicBaseUrl(process.env.ALIYUN_OSS_PUBLIC_BASE_URL);
  const endpoint = (process.env.ALIYUN_OSS_ENDPOINT?.trim() || (bucket && region
    ? `${bucket}.${region}.aliyuncs.com`
    : "")).replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  const signingSecret = process.env.ALIYUN_OSS_MIRROR_SIGNING_SECRET?.trim() || "";
  const allowedHosts = parseAllowedHosts(
    process.env.ALIYUN_OSS_REMOTE_ALLOWED_HOSTS || process.env.ALIYUN_OSS_MIRROR_ALLOWED_HOSTS,
  );
  const generatedPrefix = normalizeObjectPrefix(
    process.env.ALIYUN_OSS_GENERATED_PREFIX || process.env.ALIYUN_OSS_PREFIX || "generated-results/original",
  );
  const mirrorPrefix = normalizeObjectPrefix(
    process.env.ALIYUN_OSS_MIRROR_PREFIX || `${generatedPrefix}/mirror`,
  );

  if (!accessKeyId || !accessKeySecret || !bucket || !region || !publicBaseUrl || !endpoint) {
    throw new Error("OSS remote transfer requires the standard ALIYUN_OSS_* storage configuration");
  }
  if (endpoint !== `${bucket}.${region}.aliyuncs.com`) {
    throw new Error("ALIYUN_OSS_ENDPOINT must be the bucket HTTPS endpoint for its configured region");
  }
  if (signingSecret.length < 32) {
    throw new Error("ALIYUN_OSS_MIRROR_SIGNING_SECRET must contain at least 32 characters");
  }
  if (!allowedHosts.length) {
    throw new Error("ALIYUN_OSS_REMOTE_ALLOWED_HOSTS must explicitly allow provider image hosts");
  }
  if (!/^(?:hex:)?[a-f0-9]{64}$/i.test(process.env.ADMIN_SECRETS_ENCRYPTION_KEY?.trim() || "")) {
    throw new Error("ADMIN_SECRETS_ENCRYPTION_KEY must be a 32-byte hex key for encrypted remote sources");
  }

  return {
    accessKeyId,
    accessKeySecret,
    bucket,
    publicBaseUrl,
    endpoint,
    signingSecret,
    allowedHosts,
    mirrorPrefix,
    securityToken: process.env.ALIYUN_OSS_SECURITY_TOKEN?.trim(),
    ttlSeconds: clampInt(
      process.env.ALIYUN_OSS_MIRROR_TTL_SECONDS,
      5 * 60,
      24 * 60 * 60,
      DEFAULT_MIRROR_TTL_SECONDS,
    ),
    preflightTimeoutMs: clampInt(
      process.env.ALIYUN_OSS_MIRROR_PREFLIGHT_TIMEOUT_MS,
      1_000,
      30_000,
      DEFAULT_PREFLIGHT_TIMEOUT_MS,
    ),
    triggerTimeoutMs: clampInt(
      process.env.ALIYUN_OSS_MIRROR_TRIGGER_TIMEOUT_MS,
      1_000,
      60_000,
      DEFAULT_TRIGGER_TIMEOUT_MS,
    ),
    streamTimeoutMs: clampInt(
      process.env.ALIYUN_OSS_REMOTE_STREAM_TIMEOUT_MS,
      10_000,
      10 * 60_000,
      DEFAULT_STREAM_TIMEOUT_MS,
    ),
    waitTimeoutMs: clampInt(
      process.env.ALIYUN_OSS_MIRROR_WAIT_TIMEOUT_MS,
      10_000,
      15 * 60_000,
      DEFAULT_WAIT_TIMEOUT_MS,
    ),
    maxBytes: clampInt(
      process.env.ALIYUN_OSS_MIRROR_MAX_BYTES,
      1 * 1024 * 1024,
      512 * 1024 * 1024,
      DEFAULT_MAX_BYTES,
    ),
    maxAttempts: clampInt(
      process.env.ALIYUN_OSS_MIRROR_MAX_ATTEMPTS,
      1,
      16,
      DEFAULT_MAX_ATTEMPTS,
    ),
    retryBaseMs: clampInt(
      process.env.ALIYUN_OSS_MIRROR_RETRY_BASE_MS,
      100,
      10_000,
      DEFAULT_RETRY_BASE_MS,
    ),
    networkConcurrency: clampInt(
      process.env.ALIYUN_OSS_REMOTE_CONCURRENCY || process.env.ALIYUN_OSS_MIRROR_CONCURRENCY,
      1,
      64,
      DEFAULT_NETWORK_CONCURRENCY,
    ),
    completedRetentionDays: clampInt(
      process.env.ALIYUN_OSS_MIRROR_COMPLETED_RETENTION_DAYS,
      1,
      90,
      7,
    ),
    failedRetentionDays: clampInt(
      process.env.ALIYUN_OSS_MIRROR_FAILED_RETENTION_DAYS,
      1,
      30,
      3,
    ),
  };
}

function getTransferLeaseMs(config: MirrorConfig) {
  if (getAliyunOssRemoteTransferMode() !== "stream") return MIRROR_LEASE_MS;
  return Math.min(MIRROR_LEASE_MS, config.streamTimeoutMs + STREAM_LEASE_GRACE_MS);
}

function buildMirrorObjectKey(
  prefix: string,
  id: string,
  expiresAtMs: number,
  contentType: SupportedImageType,
  signingSecret: string,
) {
  const date = new Date();
  const yyyy = String(date.getUTCFullYear());
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const expiry = Math.floor(expiresAtMs / 1_000).toString(36);
  const extension = extensionForType(contentType);
  const unsigned = `${prefix}/${yyyy}/${mm}/${dd}/${id}.${expiry}.${extension}`;
  const signature = createHmac("sha256", signingSecret).update(unsigned).digest("base64url");
  return `${prefix}/${yyyy}/${mm}/${dd}/${id}.${expiry}.${signature}.${extension}`;
}

function verifyMirrorObjectKey(objectKey: string, config: MirrorConfig) {
  if (objectKey.length > 1_023 || !objectKey.startsWith(`${config.mirrorPrefix}/`)) return false;
  const match = /^(.*\/([0-9a-f-]{36})\.([0-9a-z]+))\.([A-Za-z0-9_-]{43})\.(aac|avif|gif|jpg|m4a|mov|mp3|mp4|png|wav|webm|webp)$/.exec(objectKey);
  if (!match) return false;
  const expirySeconds = Number.parseInt(match[3], 36);
  if (!Number.isSafeInteger(expirySeconds) || expirySeconds * 1_000 <= Date.now()) return false;
  if (expirySeconds * 1_000 > Date.now() + 24 * 60 * 60_000 + 60_000) return false;
  const unsigned = `${match[1]}.${match[5]}`;
  const expected = createHmac("sha256", config.signingSecret).update(unsigned).digest("base64url");
  return safeEqual(match[4], expected);
}

function matchesImageMagic(bytes: Uint8Array, contentType: SupportedImageType) {
  if (contentType === "video/mp4" || contentType === "video/quicktime" || contentType === "audio/mp4") {
    return bytes.length >= 12 && Buffer.from(bytes.subarray(4, 8)).toString("ascii") === "ftyp";
  }
  if (contentType === "video/webm") {
    return bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  }
  if (contentType === "audio/mpeg") {
    return Buffer.from(bytes.subarray(0, 3)).toString("ascii") === "ID3"
      || (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  }
  if (contentType === "audio/wav") {
    return Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF"
      && Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WAVE";
  }
  if (contentType === "audio/aac") {
    return bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0;
  }
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return signature.every((value, index) => bytes[index] === value);
  }
  if (contentType === "image/gif") {
    const header = Buffer.from(bytes.subarray(0, 6)).toString("ascii");
    return header === "GIF87a" || header === "GIF89a";
  }
  if (contentType === "image/webp") {
    return Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF"
      && Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP";
  }
  if (contentType === "image/avif") {
    const box = Buffer.from(bytes.subarray(4, 32)).toString("ascii");
    return box.startsWith("ftyp") && (box.includes("avif") || box.includes("avis"));
  }
  return false;
}

function normalizeSupportedImageType(value: unknown): SupportedImageType | null {
  const normalized = String(value || "").split(";")[0].trim().toLowerCase();
  if (normalized === "image/jpg") return "image/jpeg";
  if (
    normalized === "image/avif"
    || normalized === "audio/aac"
    || normalized === "audio/mp4"
    || normalized === "audio/mpeg"
    || normalized === "audio/wav"
    || normalized === "image/gif"
    || normalized === "image/jpeg"
    || normalized === "image/png"
    || normalized === "image/webp"
    || normalized === "video/mp4"
    || normalized === "video/quicktime"
    || normalized === "video/webm"
  ) return normalized;
  return null;
}

function extensionForType(contentType: SupportedImageType) {
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "audio/mpeg") return "mp3";
  if (contentType === "audio/mp4") return "m4a";
  if (contentType === "audio/wav") return "wav";
  if (contentType === "video/quicktime") return "mov";
  return contentType.split("/")[1];
}

function parseAllowedHosts(value?: string) {
  const hosts = (value || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  for (const host of hosts) {
    if (
      host === "*"
      || host.includes(":")
      || host.includes("/")
      || host.includes("?")
      || host.includes("#")
      || !/^(?:\*\.)?[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host)
    ) throw new Error(`invalid OSS mirror allowed host: ${host}`);
  }
  return [...new Set(hosts)];
}

function validatePublicBaseUrl(value?: string) {
  const normalized = (value || "").trim().replace(/\/+$/, "");
  if (!normalized) return "";
  const url = new URL(normalized);
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.search
    || url.hash
    || url.pathname !== "/"
  ) throw new Error("ALIYUN_OSS_PUBLIC_BASE_URL must be an HTTPS origin without a path");
  return normalized;
}

function buildObjectUrl(baseUrl: string, objectKey: string) {
  return `${baseUrl.replace(/\/+$/, "")}/${objectKey.split("/").map(encodeURIComponent).join("/")}`;
}

function normalizeObjectPrefix(value: string) {
  const prefix = value.trim().replace(/^\/+|\/+$/g, "");
  if (!prefix || prefix.includes("..") || /[\\?#]/.test(prefix)) {
    throw new Error("ALIYUN_OSS_MIRROR_PREFIX is invalid");
  }
  return prefix;
}

async function readResponsePrefix(response: Response, maxBytes: number) {
  if (!response.body) throw terminalError("remote response body is empty");
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    const kept = value.subarray(0, Math.min(value.byteLength, maxBytes - total));
    chunks.push(Buffer.from(kept));
    total += kept.byteLength;
    if (kept.byteLength < value.byteLength || total >= maxBytes) {
      await reader.cancel().catch(() => undefined);
      break;
    }
  }
  return Buffer.concat(chunks, total);
}

async function readResponseSnippet(response: Response, maxBytes: number) {
  try {
    return (await readResponsePrefix(response, maxBytes)).toString("utf8").trim();
  } catch {
    return "";
  }
}

function asRows(value: unknown) {
  return (Array.isArray(value) ? value : []) as MirrorTransferRow[];
}

function firstRecord(value: unknown) {
  const row = Array.isArray(value) ? value[0] : null;
  return row && typeof row === "object" ? row as Record<string, unknown> : null;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function safeEqual(actual: string, expected: string) {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function httpError(context: string, status: number) {
  const retryable = status === 408 || status === 429 || status >= 500;
  return new OssMirrorTransferError(
    `${context} HTTP ${status}`,
    retryable,
  );
}

function terminalError(message: string) {
  return new OssMirrorTransferError(message, false);
}

function retryableError(message: string) {
  return new OssMirrorTransferError(message, true);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let activeNetworkRequests = 0;
const networkWaiters: Array<() => void> = [];

async function withNetworkPermit<T>(limit: number, work: () => Promise<T>) {
  if (activeNetworkRequests >= limit) {
    await new Promise<void>((resolve) => networkWaiters.push(resolve));
  }
  activeNetworkRequests += 1;
  try {
    return await work();
  } finally {
    activeNetworkRequests -= 1;
    networkWaiters.shift()?.();
  }
}

function clampInt(
  value: string | number | undefined,
  min: number,
  max: number,
  fallback: number,
) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}
