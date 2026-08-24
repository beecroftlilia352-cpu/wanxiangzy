import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import IORedis from "ioredis";
import {
  databaseMediaAssetRegistry,
  MediaAssetRegistryError,
  type MediaAssetRegistry,
  type MediaAssetUploadLease,
} from "@/lib/api/media-asset-registry.server";

export type DirectUploadKind = "image" | "video";

export type DirectUploadDescriptor = {
  name?: string;
  size: number;
  contentType: string;
  sha256: string;
};

type UploadIntent = {
  v: 1;
  userId: string;
  ownerHash: string;
  kind: DirectUploadKind;
  purpose: string;
  objectKey: string;
  size: number;
  contentType: string;
  sha256: string;
  expiresAt: number;
  assetId: string;
  leaseToken: string;
  fenceVersion: number;
};

type RedisCapacityClient = Pick<IORedis, "eval" | "zrem"> & Partial<Pick<IORedis, "disconnect">>;

export class DirectUploadError extends Error {
  constructor(
    public readonly code:
      | "CONFIGURATION"
      | "INVALID_REQUEST"
      | "RATE_LIMITED"
      | "ACTIVE_LIMIT"
      | "QUOTA_EXCEEDED"
      | "CAPACITY_UNAVAILABLE"
      | "ASSET_REGISTRY_UNAVAILABLE"
      | "INTENT_EXPIRED"
      | "UPLOAD_NOT_FOUND"
      | "UPLOAD_MISMATCH"
      | "UNSAFE_CONTENT",
    message: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "DirectUploadError";
  }
}

const IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
const VIDEO_TYPES = new Map([
  ["video/mp4", "mp4"],
  ["video/quicktime", "mov"],
  ["video/mov", "mov"],
]);
const DEFAULT_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
const DEFAULT_VIDEO_MAX_BYTES = 100 * 1024 * 1024;
const DEFAULT_MAX_IMAGE_PIXELS = 40_000_000;
const DEFAULT_MAX_IMAGE_EDGE = 12_000;
const DEFAULT_INTENT_TTL_SECONDS = 300;
const DEFAULT_DAILY_QUOTA_BYTES = 2 * 1024 * 1024 * 1024;
const DEFAULT_RATE_PER_MINUTE = 120;
const DEFAULT_ACTIVE_INTENTS = 20;
const REDIS_CONNECT_TIMEOUT_MS = 3_000;

let redis: RedisCapacityClient | null | undefined;
let redisConnecting: Promise<RedisCapacityClient | null> | undefined;
let redisReconnectAfter = 0;
let mediaAssetRegistry: MediaAssetRegistry = databaseMediaAssetRegistry;
const localAdmissions = new Map<string, { bytes: number; startedAt: number; reservations: Map<string, number>; rate: number[] }>();

const ADMIT_SCRIPT = `
local rateKey = KEYS[1]
local activeKey = KEYS[2]
local quotaKey = KEYS[3]
local reservationKey = KEYS[4]
local redisTime = redis.call('TIME')
local now = tonumber(redisTime[1]) * 1000 + math.floor(tonumber(redisTime[2]) / 1000)
local size = tonumber(ARGV[1])
local maxBytes = tonumber(ARGV[2])
local rateLimit = tonumber(ARGV[3])
local activeLimit = tonumber(ARGV[4])
local intentId = ARGV[5]
local activeTtlMs = tonumber(ARGV[6])
local quotaTtlMs = tonumber(ARGV[7])
redis.call('ZREMRANGEBYSCORE', rateKey, '-inf', now - 60000)
redis.call('ZREMRANGEBYSCORE', activeKey, '-inf', now)
if redis.call('EXISTS', reservationKey) == 1 then
  redis.call('ZADD', activeKey, now + activeTtlMs, intentId)
  redis.call('PEXPIRE', activeKey, activeTtlMs + 60000)
  return {2, tonumber(redis.call('GET', quotaKey) or '0'), redis.call('ZCARD', activeKey)}
end
if redis.call('ZCARD', rateKey) >= rateLimit then return {0, 1, 0} end
if redis.call('ZCARD', activeKey) >= activeLimit then return {0, 2, 0} end
local currentBytes = tonumber(redis.call('GET', quotaKey) or '0')
if currentBytes + size > maxBytes then return {0, 3, currentBytes} end
redis.call('SET', reservationKey, size, 'PX', quotaTtlMs, 'NX')
redis.call('ZADD', rateKey, now, intentId)
redis.call('PEXPIRE', rateKey, 120000)
redis.call('ZADD', activeKey, now + activeTtlMs, intentId)
redis.call('PEXPIRE', activeKey, activeTtlMs + 60000)
local total = redis.call('INCRBY', quotaKey, size)
if currentBytes == 0 then redis.call('PEXPIRE', quotaKey, quotaTtlMs) end
return {1, total, redis.call('ZCARD', activeKey)}
`;

export function directUploadsEnabled(env: NodeJS.ProcessEnv = process.env) {
  const requested = (env.UPLOAD_DELIVERY_MODE || (env.NODE_ENV === "production" ? "direct" : "server")).trim().toLowerCase();
  if (requested !== "direct" && requested !== "server") {
    throw new DirectUploadError("CONFIGURATION", "UPLOAD_DELIVERY_MODE must be direct or server");
  }
  if (env.NODE_ENV === "production" && requested !== "direct") {
    throw new DirectUploadError("CONFIGURATION", "production requires direct upload mode");
  }
  return requested === "direct";
}

export async function prepareDirectUpload(input: {
  userId: string;
  kind: DirectUploadKind;
  purpose?: string;
  file: DirectUploadDescriptor;
}) {
  if (!directUploadsEnabled()) return { mode: "server" as const };
  const config = getOssUploadConfig();
  const descriptor = validateDescriptor(input.kind, input.file);
  const purpose = normalizePurpose(input.purpose, input.kind);
  const ownerHash = hashUserId(input.userId);
  const extension = getAllowedTypes(input.kind).get(descriptor.contentType)!;
  const objectKey = buildImmutableObjectKey(ownerHash, purpose, descriptor.sha256, extension);
  const intentId = createHash("sha256").update(objectKey).digest("hex");
  const ttlSeconds = boundedInteger(process.env.UPLOAD_INTENT_TTL_SECONDS, DEFAULT_INTENT_TTL_SECONDS, 60, 600);

  await admitUpload({ ownerHash, intentId, objectKey, size: descriptor.size, ttlSeconds });

  let asset: MediaAssetUploadLease;
  try {
    asset = await mediaAssetRegistry.createUpload({
      ownerUserId: input.userId,
      idempotencyKey: `upload:v1:${input.kind}:${intentId}`,
      objectKey,
      purpose,
      expectedSha256: descriptor.sha256,
      expectedSizeBytes: descriptor.size,
      expectedMimeType: descriptor.contentType,
      leaseSeconds: ttlSeconds,
      bucketName: config.bucket,
    });
  } catch {
    await releaseAdmission(ownerHash, objectKey);
    throw new DirectUploadError("ASSET_REGISTRY_UNAVAILABLE", "media asset registry is unavailable", 5);
  }
  if (asset.objectKey !== objectKey) {
    await releaseAdmission(ownerHash, objectKey);
    throw new DirectUploadError("UPLOAD_MISMATCH", "media asset registration does not match the upload intent");
  }
  if (asset.status === "verified") {
    await releaseAdmission(ownerHash, objectKey);
    const url = canonicalAssetUrl(asset.assetId);
    return {
      mode: "ready" as const,
      status: "verified" as const,
      media_asset_id: asset.assetId,
      canonical_url: canonicalAssetUrl(asset.assetId),
      url,
      display_url: url,
      delete_url: "",
      width: 0,
      height: 0,
    };
  }
  if (asset.status === "uploaded") {
    await releaseAdmission(ownerHash, objectKey);
    if (input.kind === "image") {
      try {
        // Images reach `uploaded` only after this service has read the complete
        // object, matched SHA-256 and decoded it with Sharp. This closes the
        // narrow crash window between complete and verify without re-uploading.
        await mediaAssetRegistry.verifyAsset({ assetId: asset.assetId, fenceVersion: asset.fenceVersion });
      } catch {
        throw new DirectUploadError("ASSET_REGISTRY_UNAVAILABLE", "media asset registry is unavailable", 5);
      }
      const url = canonicalAssetUrl(asset.assetId);
      return {
        mode: "ready" as const,
        status: "verified" as const,
        media_asset_id: asset.assetId,
        canonical_url: url,
        url,
        display_url: url,
        delete_url: "",
        width: 0,
        height: 0,
      };
    }
    return {
      mode: "pending_validation" as const,
      status: "pending_validation" as const,
      media_asset_id: asset.assetId,
      canonical_url: canonicalAssetUrl(asset.assetId),
    };
  }
  if (asset.status !== "pending" || !asset.leaseToken) {
    await releaseAdmission(ownerHash, objectKey);
    throw new DirectUploadError("UPLOAD_MISMATCH", "media asset is not eligible for upload");
  }

  const expiresAt = Date.now() + ttlSeconds * 1000;
  const intent: UploadIntent = {
    v: 1,
    userId: input.userId,
    ownerHash,
    kind: input.kind,
    purpose,
    objectKey,
    size: descriptor.size,
    contentType: descriptor.contentType,
    sha256: descriptor.sha256,
    expiresAt,
    assetId: asset.assetId,
    leaseToken: asset.leaseToken,
    fenceVersion: asset.fenceVersion,
  };
  const expiration = new Date(expiresAt).toISOString();
  const conditions: unknown[] = [
    { bucket: config.bucket },
    ["eq", "$key", objectKey],
    ["content-length-range", descriptor.size, descriptor.size],
    ["eq", "$Content-Type", descriptor.contentType],
    ["eq", "$x-oss-meta-sha256", descriptor.sha256],
    ["eq", "$x-oss-meta-upload-owner", ownerHash],
    ["eq", "$x-oss-meta-upload-purpose", purpose],
    ["eq", "$x-oss-forbid-overwrite", "true"],
    ["eq", "$x-oss-object-acl", "private"],
    ["eq", "$success_action_status", "200"],
  ];
  if (config.securityToken) conditions.push(["eq", "$x-oss-security-token", config.securityToken]);
  const policy = Buffer.from(JSON.stringify({ expiration, conditions })).toString("base64");
  const signature = createHmac("sha1", config.accessKeySecret).update(policy).digest("base64");
  const fields: Record<string, string> = {
    key: objectKey,
    policy,
    OSSAccessKeyId: config.accessKeyId,
    Signature: signature,
    "Content-Type": descriptor.contentType,
    "x-oss-meta-sha256": descriptor.sha256,
    "x-oss-meta-upload-owner": ownerHash,
    "x-oss-meta-upload-purpose": purpose,
    "x-oss-forbid-overwrite": "true",
    "x-oss-object-acl": "private",
    success_action_status: "200",
  };
  if (config.securityToken) fields["x-oss-security-token"] = config.securityToken;

  return {
    mode: "direct" as const,
    uploadUrl: config.uploadBaseUrl,
    fields,
    token: signIntent(intent),
    expiresAt: expiration,
    maxBytes: maxBytesFor(input.kind),
    media_asset_id: asset.assetId,
    canonical_url: canonicalAssetUrl(asset.assetId),
  };
}

export async function completeDirectUpload(userId: string, token: string) {
  const intent = verifyIntent(token, userId);
  const config = getOssUploadConfig();
  let head: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    head = await signedObjectRequest(config, intent.objectKey, "HEAD");
    if (head.ok) break;
    if (head.status !== 404) break;
    await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
  }
  if (!head?.ok) {
    try {
      await failRegisteredUpload(intent, "upload_object_not_found");
    } finally {
      await releaseAdmission(intent.ownerHash, intent.objectKey);
    }
    throw new DirectUploadError("UPLOAD_NOT_FOUND", "OSS object was not found after upload");
  }

  try {
    assertHeadMatchesIntent(head.headers, intent);
    let dimensions = { width: 0, height: 0 };
    if (intent.kind === "image") dimensions = await inspectStoredImage(config, intent);
    else await inspectStoredVideo(config, intent);
    const settlement = await mediaAssetRegistry.completeUpload({
      assetId: intent.assetId,
      leaseToken: intent.leaseToken,
      fenceVersion: intent.fenceVersion,
      sha256: intent.sha256,
      sizeBytes: intent.size,
      mimeType: intent.contentType,
      width: intent.kind === "image" ? dimensions.width : undefined,
      height: intent.kind === "image" ? dimensions.height : undefined,
    });
    if (!settlement.metadataMatches || settlement.status === "quarantined") {
      throw new DirectUploadError("UPLOAD_MISMATCH", "uploaded object metadata does not match its registration");
    }
    await releaseAdmission(intent.ownerHash, intent.objectKey);
    if (intent.kind === "video") {
      if (settlement.status === "verified") {
        const url = canonicalAssetUrl(intent.assetId);
        return {
          status: "verified" as const,
          media_asset_id: intent.assetId,
          canonical_url: url,
          url,
          display_url: url,
          delete_url: "",
          ...dimensions,
        };
      }
      return {
        status: "pending_validation" as const,
        media_asset_id: intent.assetId,
        canonical_url: canonicalAssetUrl(intent.assetId),
        url: "",
        display_url: "",
        delete_url: "",
        ...dimensions,
      };
    }
    if (settlement.status !== "verified") {
      await mediaAssetRegistry.verifyAsset({
        assetId: intent.assetId,
        fenceVersion: settlement.fenceVersion,
      });
    }
    const url = canonicalAssetUrl(intent.assetId);
    return {
      status: "verified" as const,
      media_asset_id: intent.assetId,
      canonical_url: canonicalAssetUrl(intent.assetId),
      url,
      display_url: url,
      delete_url: "",
      ...dimensions,
    };
  } catch (error) {
    await releaseAdmission(intent.ownerHash, intent.objectKey);
    if (error instanceof MediaAssetRegistryError) {
      // The RPC may have committed even if its response was lost. Preserve the
      // immutable object and let the caller replay the same fenced receipt.
      throw new DirectUploadError("ASSET_REGISTRY_UNAVAILABLE", "media asset registry is unavailable", 5);
    }
    await deleteObjectQuietly(config, intent.objectKey);
    await failRegisteredUpload(intent, directUploadFailureCode(error));
    if (error instanceof DirectUploadError) throw error;
    throw new DirectUploadError("UNSAFE_CONTENT", "uploaded content failed validation");
  }
}

export async function inspectImageBytes(bytes: Buffer, contentType: string, expectedSha256?: string) {
  const type = normalizeContentType(contentType);
  if (!IMAGE_TYPES.has(type) || !matchesImageMagic(bytes, type)) {
    throw new DirectUploadError("UNSAFE_CONTENT", "image content does not match its MIME type");
  }
  if (expectedSha256 && sha256(bytes) !== expectedSha256) {
    throw new DirectUploadError("UPLOAD_MISMATCH", "image content hash does not match the upload intent");
  }
  try {
    const sharp = (await import("sharp")).default;
    const maxPixels = boundedInteger(process.env.UPLOAD_IMAGE_MAX_PIXELS, DEFAULT_MAX_IMAGE_PIXELS, 1_000_000, 100_000_000);
    const maxEdge = boundedInteger(process.env.UPLOAD_IMAGE_MAX_EDGE, DEFAULT_MAX_IMAGE_EDGE, 1_000, 30_000);
    const metadata = await sharp(bytes, { failOn: "error", limitInputPixels: maxPixels }).metadata();
    const width = Number(metadata.width || 0);
    const height = Number(metadata.height || 0);
    if (!width || !height || width > maxEdge || height > maxEdge || width * height > maxPixels) {
      throw new Error("image dimensions exceed policy");
    }
    const expectedFormat = type === "image/jpeg" ? "jpeg" : type.slice("image/".length);
    if (metadata.format !== expectedFormat) throw new Error("decoded image format mismatch");
    return { width, height };
  } catch {
    throw new DirectUploadError("UNSAFE_CONTENT", "image cannot be decoded safely or exceeds pixel limits");
  }
}

/** Prefer the file signature over a browser-supplied MIME type. Downloaded
 * files are commonly reported as application/octet-stream (or keep the
 * download filename's stale extension), while the bytes themselves are valid
 * JPEG/PNG/WebP images. */
export function resolveSupportedImageContentType(
  bytes: Buffer,
  declaredContentType?: string | null,
  filename?: string | null,
) {
  const detected = detectSupportedImageContentType(bytes);
  if (detected) return detected;

  const declared = normalizeContentType(declaredContentType || "");
  if (IMAGE_TYPES.has(declared)) return declared;

  const extension = filename?.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  return declared;
}

export function inspectVideoHeader(bytes: Buffer, contentType: string) {
  const type = normalizeContentType(contentType);
  if (!VIDEO_TYPES.has(type) || bytes.length < 12 || bytes.subarray(4, 8).toString("ascii") !== "ftyp") {
    throw new DirectUploadError("UNSAFE_CONTENT", "video must be a valid MP4 or MOV file");
  }
  const brand = bytes.subarray(8, 12).toString("ascii");
  const allowedBrands = new Set(["isom", "iso2", "iso3", "iso4", "iso5", "iso6", "mp41", "mp42", "avc1", "M4V ", "qt  "]);
  if (!allowedBrands.has(brand)) throw new DirectUploadError("UNSAFE_CONTENT", "unsupported MP4/MOV brand");
}

export async function admitServerFallback(input: {
  userId: string;
  kind: DirectUploadKind;
  bytes: Buffer;
  contentType: string;
  purpose?: string;
}) {
  const purpose = normalizePurpose(input.purpose, input.kind);
  const ownerHash = hashUserId(input.userId);
  const digest = sha256(input.bytes);
  const contentType = normalizeContentType(input.contentType);
  const extension = getAllowedTypes(input.kind).get(contentType);
  if (!extension) throw new DirectUploadError("INVALID_REQUEST", `${input.kind} MIME type is not supported`);
  const objectKey = buildImmutableObjectKey(ownerHash, purpose, digest, extension);
  const config = getOssUploadConfig();
  await admitUpload({
    ownerHash,
    intentId: createHash("sha256").update(objectKey).digest("hex"),
    objectKey,
    size: input.bytes.length,
    ttlSeconds: DEFAULT_INTENT_TTL_SECONDS,
  });
  let asset: MediaAssetUploadLease;
  try {
    const intentId = createHash("sha256").update(objectKey).digest("hex");
    asset = await mediaAssetRegistry.createUpload({
      ownerUserId: input.userId,
      idempotencyKey: `upload:v1:${input.kind}:${intentId}`,
      objectKey,
      purpose,
      expectedSha256: digest,
      expectedSizeBytes: input.bytes.length,
      expectedMimeType: contentType,
      leaseSeconds: DEFAULT_INTENT_TTL_SECONDS,
      bucketName: config.bucket,
    });
  } catch {
    await releaseAdmission(ownerHash, objectKey);
    throw new DirectUploadError("ASSET_REGISTRY_UNAVAILABLE", "media asset registry is unavailable", 5);
  }
  if (asset.objectKey !== objectKey || asset.status === "quarantined" || asset.status === "deleted") {
    await releaseAdmission(ownerHash, objectKey);
    throw new DirectUploadError("UPLOAD_MISMATCH", "media asset is not eligible for upload");
  }
  return {
    sha256: digest,
    objectKey,
    mediaAssetId: asset.assetId,
    status: asset.status,
    async complete(options: { width?: number; height?: number; deferValidation?: boolean } = {}) {
      try {
        if (asset.status === "verified") return;
        if (asset.status === "uploaded") {
          if (!options.deferValidation) {
            await mediaAssetRegistry.verifyAsset({ assetId: asset.assetId, fenceVersion: asset.fenceVersion });
          }
          return;
        }
        if (!asset.leaseToken) throw new DirectUploadError("UPLOAD_MISMATCH", "media asset upload lease is unavailable");
        const settlement = await mediaAssetRegistry.completeUpload({
          assetId: asset.assetId,
          leaseToken: asset.leaseToken,
          fenceVersion: asset.fenceVersion,
          sha256: digest,
          sizeBytes: input.bytes.length,
          mimeType: contentType,
          width: options.width,
          height: options.height,
        });
        if (!settlement.metadataMatches || settlement.status === "quarantined") {
          throw new DirectUploadError("UPLOAD_MISMATCH", "uploaded object metadata does not match its registration");
        }
        if (!options.deferValidation) {
          await mediaAssetRegistry.verifyAsset({ assetId: asset.assetId, fenceVersion: settlement.fenceVersion });
        }
      } catch (error) {
        if (error instanceof MediaAssetRegistryError) {
          throw new DirectUploadError("ASSET_REGISTRY_UNAVAILABLE", "media asset registry is unavailable", 5);
        }
        throw error;
      }
    },
    async fail(errorCode = "server_fallback_upload_failed") {
      if (asset.status !== "pending" || !asset.leaseToken) return;
      await mediaAssetRegistry.failUpload({
        assetId: asset.assetId,
        leaseToken: asset.leaseToken,
        fenceVersion: asset.fenceVersion,
        errorCode,
      });
    },
    release: () => releaseAdmission(ownerHash, objectKey),
  };
}

export function serverFallbackMaxBytes(kind: DirectUploadKind) {
  const defaultMb = kind === "image" ? 5 : 10;
  return boundedInteger(process.env.UPLOAD_SERVER_FALLBACK_MAX_MB, defaultMb, 1, 25) * 1024 * 1024;
}

/** Resolve a registry-owned private upload to a short-lived OSS GET URL. */
export function createPrivateUploadReadUrl(objectKey: string) {
  const config = getOssUploadConfig();
  const prefix = `${cleanPrefix(process.env.ALIYUN_OSS_UPLOAD_PREFIX || "ai-tryon/user-uploads/original")}/`;
  if (!objectKey.startsWith(prefix) || objectKey.includes("\\") || objectKey.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new DirectUploadError("INVALID_REQUEST", "media asset object key is outside the private upload prefix");
  }
  return createSignedObjectReadUrl(config, objectKey);
}

function validateDescriptor(kind: DirectUploadKind, file: DirectUploadDescriptor) {
  const size = Number(file.size);
  const contentType = normalizeContentType(file.contentType);
  const sha = String(file.sha256 || "").trim().toLowerCase();
  if (!Number.isSafeInteger(size) || size <= 0 || size > maxBytesFor(kind)) {
    throw new DirectUploadError("INVALID_REQUEST", `${kind} size is outside the allowed range`);
  }
  if (!getAllowedTypes(kind).has(contentType)) {
    throw new DirectUploadError("INVALID_REQUEST", `${kind} MIME type is not supported`);
  }
  if (!/^[a-f0-9]{64}$/.test(sha)) {
    throw new DirectUploadError("INVALID_REQUEST", "sha256 must be 64 lowercase hexadecimal characters");
  }
  return { size, contentType, sha256: sha };
}

function normalizePurpose(value: string | undefined, kind: DirectUploadKind) {
  const fallback = kind === "image" ? "image-input" : "video-input";
  const normalized = (value || fallback).trim().toLowerCase();
  const allowed = kind === "image"
    ? new Set(["image-input", "reference-image", "mask-image", "avatar-image"])
    : new Set(["video-input", "reference-video"]);
  if (!allowed.has(normalized)) throw new DirectUploadError("INVALID_REQUEST", "upload purpose is not allowed");
  return normalized;
}

function getAllowedTypes(kind: DirectUploadKind) {
  return kind === "image" ? IMAGE_TYPES : VIDEO_TYPES;
}

function maxBytesFor(kind: DirectUploadKind) {
  const fallback = kind === "image" ? DEFAULT_IMAGE_MAX_BYTES : DEFAULT_VIDEO_MAX_BYTES;
  const envName = kind === "image" ? "UPLOAD_IMAGE_MAX_MB" : "UPLOAD_VIDEO_MAX_MB";
  return boundedInteger(process.env[envName], fallback / 1024 / 1024, 1, kind === "image" ? 32 : 500) * 1024 * 1024;
}

function buildImmutableObjectKey(ownerHash: string, purpose: string, contentHash: string, extension: string) {
  const configured = cleanPrefix(process.env.ALIYUN_OSS_UPLOAD_PREFIX || "ai-tryon/user-uploads/original");
  return `${configured}/${ownerHash}/${purpose}/${contentHash.slice(0, 2)}/${contentHash}.${extension}`;
}

function hashUserId(userId: string) {
  if (!userId || userId.length > 256) throw new DirectUploadError("INVALID_REQUEST", "invalid upload owner");
  return createHash("sha256").update(userId).digest("hex").slice(0, 24);
}

function signIntent(intent: UploadIntent) {
  const payload = Buffer.from(JSON.stringify(intent)).toString("base64url");
  const signature = createHmac("sha256", getIntentSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyIntent(token: string, userId: string) {
  const [payload, provided, extra] = token.split(".");
  if (!payload || !provided || extra) throw new DirectUploadError("INVALID_REQUEST", "invalid upload receipt token");
  const expected = createHmac("sha256", getIntentSecret()).update(payload).digest();
  let signature: Buffer;
  try {
    signature = Buffer.from(provided, "base64url");
  } catch {
    throw new DirectUploadError("INVALID_REQUEST", "invalid upload receipt token");
  }
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) {
    throw new DirectUploadError("INVALID_REQUEST", "invalid upload receipt token");
  }
  let intent: UploadIntent;
  try {
    intent = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as UploadIntent;
  } catch {
    throw new DirectUploadError("INVALID_REQUEST", "invalid upload receipt token");
  }
  if (intent.v !== 1 || intent.userId !== userId || intent.ownerHash !== hashUserId(userId)) {
    throw new DirectUploadError("INVALID_REQUEST", "upload receipt does not belong to this user");
  }
  if (!Number.isFinite(intent.expiresAt) || intent.expiresAt < Date.now()) {
    throw new DirectUploadError("INTENT_EXPIRED", "upload receipt expired");
  }
  validateDescriptor(intent.kind, {
    size: intent.size,
    contentType: intent.contentType,
    sha256: intent.sha256,
  });
  const expectedKey = buildImmutableObjectKey(intent.ownerHash, intent.purpose, intent.sha256, getAllowedTypes(intent.kind).get(intent.contentType)!);
  if (intent.objectKey !== expectedKey) throw new DirectUploadError("INVALID_REQUEST", "upload receipt key is invalid");
  if (!isUuid(intent.assetId) || !isUuid(intent.leaseToken) || !Number.isSafeInteger(intent.fenceVersion) || intent.fenceVersion < 1) {
    throw new DirectUploadError("INVALID_REQUEST", "upload receipt asset lease is invalid");
  }
  return intent;
}

function getIntentSecret() {
  const secret = process.env.UPLOAD_INTENT_SECRET?.trim();
  if (!secret || Buffer.byteLength(secret) < 32) {
    throw new DirectUploadError("CONFIGURATION", "UPLOAD_INTENT_SECRET must be at least 32 bytes");
  }
  return secret;
}

function getOssUploadConfig() {
  if ((process.env.IMAGE_STORAGE_PROVIDER || "").trim().toLowerCase() !== "aliyun-oss") {
    throw new DirectUploadError("CONFIGURATION", "direct upload requires IMAGE_STORAGE_PROVIDER=aliyun-oss");
  }
  const accessKeyId = process.env.ALIYUN_OSS_ACCESS_KEY_ID?.trim();
  const accessKeySecret = process.env.ALIYUN_OSS_ACCESS_KEY_SECRET?.trim();
  const bucket = process.env.ALIYUN_OSS_BUCKET?.trim();
  const region = process.env.ALIYUN_OSS_REGION?.trim();
  const publicBaseUrl = normalizeBaseUrl(process.env.ALIYUN_OSS_PUBLIC_BASE_URL);
  const securityToken = process.env.ALIYUN_OSS_SECURITY_TOKEN?.trim();
  const configuredEndpoint = process.env.ALIYUN_OSS_ENDPOINT?.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  if (!accessKeyId || !accessKeySecret || !bucket || !region || !publicBaseUrl) {
    throw new DirectUploadError("CONFIGURATION", "Aliyun OSS upload configuration is incomplete");
  }
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(bucket) || !/^oss-[a-z0-9-]+$/.test(region)) {
    throw new DirectUploadError("CONFIGURATION", "Aliyun OSS bucket or region is invalid");
  }
  const endpoint = configuredEndpoint || `${bucket}.${region}.aliyuncs.com`;
  if (!/^[A-Za-z0-9.-]+(?::\d{1,5})?$/.test(endpoint)) {
    throw new DirectUploadError("CONFIGURATION", "Aliyun OSS endpoint is invalid");
  }
  return {
    accessKeyId,
    accessKeySecret,
    bucket,
    region,
    publicBaseUrl,
    securityToken,
    endpoint,
    uploadBaseUrl: `https://${endpoint}`,
  };
}

async function inspectStoredImage(config: ReturnType<typeof getOssUploadConfig>, intent: UploadIntent) {
  const response = await signedObjectRequest(config, intent.objectKey, "GET");
  if (!response.ok) throw new DirectUploadError("UPLOAD_NOT_FOUND", "uploaded image cannot be read");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length !== intent.size) throw new DirectUploadError("UPLOAD_MISMATCH", "uploaded image size changed");
  return inspectImageBytes(bytes, intent.contentType, intent.sha256);
}

async function inspectStoredVideo(config: ReturnType<typeof getOssUploadConfig>, intent: UploadIntent) {
  const response = await signedObjectRequest(config, intent.objectKey, "GET", { Range: "bytes=0-65535" });
  if (!response.ok) throw new DirectUploadError("UPLOAD_NOT_FOUND", "uploaded video cannot be read");
  const bytes = Buffer.from(await response.arrayBuffer());
  inspectVideoHeader(bytes, intent.contentType);
}

function assertHeadMatchesIntent(headers: Headers, intent: UploadIntent) {
  const size = Number(headers.get("content-length"));
  const type = normalizeContentType(headers.get("content-type") || "");
  const hash = headers.get("x-oss-meta-sha256")?.trim().toLowerCase();
  const owner = headers.get("x-oss-meta-upload-owner")?.trim();
  const purpose = headers.get("x-oss-meta-upload-purpose")?.trim();
  const etag = headers.get("etag")?.trim();
  if (!etag || size !== intent.size || type !== intent.contentType || hash !== intent.sha256 || owner !== intent.ownerHash || purpose !== intent.purpose) {
    throw new DirectUploadError("UPLOAD_MISMATCH", "uploaded object metadata does not match its signed intent");
  }
}

async function signedObjectRequest(
  config: ReturnType<typeof getOssUploadConfig>,
  objectKey: string,
  method: "HEAD" | "GET" | "DELETE",
  extraHeaders: Record<string, string> = {},
) {
  const date = new Date().toUTCString();
  const ossHeaders = config.securityToken ? `x-oss-security-token:${config.securityToken}\n` : "";
  const canonicalResource = `/${config.bucket}/${objectKey}`;
  const signature = createHmac("sha1", config.accessKeySecret)
    .update([method, "", "", date, `${ossHeaders}${canonicalResource}`].join("\n"))
    .digest("base64");
  const headers: Record<string, string> = {
    Authorization: `OSS ${config.accessKeyId}:${signature}`,
    Date: date,
    ...extraHeaders,
  };
  if (config.securityToken) headers["x-oss-security-token"] = config.securityToken;
  return fetch(`https://${config.endpoint}/${encodeObjectKey(objectKey)}`, {
    method,
    headers,
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
}

async function deleteObjectQuietly(config: ReturnType<typeof getOssUploadConfig>, objectKey: string) {
  try {
    await signedObjectRequest(config, objectKey, "DELETE");
  } catch {
    // Lifecycle rules remain the final cleanup guard if deletion is unavailable.
  }
}

async function failRegisteredUpload(intent: UploadIntent, errorCode: string) {
  try {
    await mediaAssetRegistry.failUpload({
      assetId: intent.assetId,
      leaseToken: intent.leaseToken,
      fenceVersion: intent.fenceVersion,
      errorCode,
    });
  } catch (error) {
    if (error instanceof MediaAssetRegistryError) {
      throw new DirectUploadError("ASSET_REGISTRY_UNAVAILABLE", "media asset registry is unavailable", 5);
    }
    // A metadata mismatch may already have atomically quarantined the asset.
  }
}

function directUploadFailureCode(error: unknown) {
  if (error instanceof DirectUploadError) return `direct_upload_${error.code.toLowerCase()}`;
  return "direct_upload_validation_failed";
}

async function admitUpload(input: { ownerHash: string; intentId: string; objectKey: string; size: number; ttlSeconds: number }) {
  const maxBytes = boundedInteger(process.env.UPLOAD_DAILY_QUOTA_MB, DEFAULT_DAILY_QUOTA_BYTES / 1024 / 1024, 10, 100_000) * 1024 * 1024;
  const rateLimit = boundedInteger(process.env.UPLOAD_INTENT_RATE_PER_MINUTE, DEFAULT_RATE_PER_MINUTE, 1, 10_000);
  const activeLimit = boundedInteger(process.env.UPLOAD_MAX_ACTIVE_INTENTS, DEFAULT_ACTIVE_INTENTS, 1, 1_000);
  const client = await getUploadRedis();
  if (!client) {
    if (process.env.NODE_ENV === "production") {
      throw new DirectUploadError("CAPACITY_UNAVAILABLE", "upload admission service is unavailable", 5);
    }
    return admitLocal(input, maxBytes, rateLimit, activeLimit);
  }
  const tag = `{${input.ownerHash}}`;
  try {
    const result = await client.eval(
      ADMIT_SCRIPT,
      4,
      `upload:${tag}:rate`,
      `upload:${tag}:active`,
      `upload:${tag}:quota`,
      `upload:${tag}:reservation:${createHash("sha256").update(input.objectKey).digest("hex")}`,
      input.size,
      maxBytes,
      rateLimit,
      activeLimit,
      input.intentId,
      input.ttlSeconds * 1000,
      24 * 60 * 60 * 1000,
    ) as unknown;
    const values = Array.isArray(result) ? result.map(Number) : [];
    if (values[0] === 1 || values[0] === 2) return;
    if (values[1] === 1) throw new DirectUploadError("RATE_LIMITED", "upload intent rate limit exceeded", 60);
    if (values[1] === 2) throw new DirectUploadError("ACTIVE_LIMIT", "too many active uploads", input.ttlSeconds);
    if (values[1] === 3) throw new DirectUploadError("QUOTA_EXCEEDED", "24-hour upload quota exceeded", 3600);
    throw new Error("invalid upload admission response");
  } catch (error) {
    if (error instanceof DirectUploadError) throw error;
    markUploadRedisUnavailable(client);
    throw new DirectUploadError("CAPACITY_UNAVAILABLE", "upload admission service is unavailable", 5);
  }
}

function admitLocal(
  input: { ownerHash: string; intentId: string; objectKey: string; size: number; ttlSeconds: number },
  maxBytes: number,
  rateLimit: number,
  activeLimit: number,
) {
  const now = Date.now();
  let state = localAdmissions.get(input.ownerHash);
  if (!state || state.startedAt <= now - 24 * 60 * 60 * 1000) {
    state = { bytes: 0, startedAt: now, reservations: new Map(), rate: [] };
    localAdmissions.set(input.ownerHash, state);
  }
  state.rate = state.rate.filter((at) => at > now - 60_000);
  for (const [key, expiresAt] of state.reservations) if (expiresAt <= now) state.reservations.delete(key);
  if (state.reservations.has(input.objectKey)) {
    state.reservations.set(input.objectKey, now + input.ttlSeconds * 1000);
    return;
  }
  if (state.rate.length >= rateLimit) throw new DirectUploadError("RATE_LIMITED", "upload intent rate limit exceeded", 60);
  if (state.reservations.size >= activeLimit) throw new DirectUploadError("ACTIVE_LIMIT", "too many active uploads", input.ttlSeconds);
  if (state.bytes + input.size > maxBytes) throw new DirectUploadError("QUOTA_EXCEEDED", "24-hour upload quota exceeded", 3600);
  state.bytes += input.size;
  state.rate.push(now);
  state.reservations.set(input.objectKey, now + input.ttlSeconds * 1000);
}

async function releaseAdmission(ownerHash: string, objectKey: string) {
  localAdmissions.get(ownerHash)?.reservations.delete(objectKey);
  const client = await getUploadRedis();
  if (!client) return;
  try {
    const intentId = createHash("sha256").update(objectKey).digest("hex");
    await client.zrem(`upload:{${ownerHash}}:active`, intentId);
  } catch {
    markUploadRedisUnavailable(client);
    // Active intents are time-bounded and self-heal even if cleanup fails.
  }
}

async function getUploadRedis(): Promise<RedisCapacityClient | null> {
  if (redis !== undefined) return redis;
  if (redisConnecting) return redisConnecting;
  if (Date.now() < redisReconnectAfter) return null;
  const url = process.env.REDIS_URL?.trim();
  if (!url || !/^rediss?:\/\//i.test(url)) return (redis = null);
  const client = new IORedis(url, {
    connectionName: "wanxiangzy:upload-admission",
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
    retryStrategy: (attempt) => attempt >= 2 ? null : 250,
  });
  client.on("error", () => {});
  redisConnecting = client.connect()
    .then(() => {
      redis = client;
      redisReconnectAfter = 0;
      return client;
    })
    .catch(() => {
      client.disconnect();
      redisReconnectAfter = Date.now() + 2_000;
      return null;
    })
    .finally(() => {
      redisConnecting = undefined;
    });
  return redisConnecting;
}

function markUploadRedisUnavailable(client: RedisCapacityClient) {
  if (redis === client) redis = undefined;
  redisReconnectAfter = Date.now() + 1_000;
  try {
    client.disconnect?.();
  } catch {
    // A fresh connection is attempted after the bounded outage backoff.
  }
}

function matchesImageMagic(bytes: Buffer, contentType: string) {
  if (contentType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === "image/png") return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (contentType === "image/webp") return bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  return false;
}

function detectSupportedImageContentType(bytes: Buffer) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

function sha256(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

function normalizeContentType(value: string) {
  const normalized = value.split(";", 1)[0].trim().toLowerCase();
  return normalized === "video/mov" ? "video/quicktime" : normalized;
}

function cleanPrefix(value: string) {
  const prefix = value.split("/").map((part) => part.replace(/[^A-Za-z0-9._-]/g, "")).filter(Boolean).join("/");
  if (!prefix) throw new DirectUploadError("CONFIGURATION", "ALIYUN_OSS_UPLOAD_PREFIX is invalid");
  return prefix;
}

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number) {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new DirectUploadError("CONFIGURATION", `upload configuration must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

function normalizeBaseUrl(value?: string) {
  const normalized = (value || "").trim().replace(/\/+$/, "");
  try {
    const url = new URL(normalized);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.search || url.hash) return "";
    return normalized;
  } catch {
    return "";
  }
}

function createSignedObjectReadUrl(config: ReturnType<typeof getOssUploadConfig>, objectKey: string) {
  const expiresInSeconds = boundedInteger(process.env.UPLOAD_READ_URL_TTL_SECONDS, 600, 60, 3600);
  const expires = String(Math.floor(Date.now() / 1000) + expiresInSeconds);
  const signedQuery: Record<string, string> = {};
  if (config.securityToken) signedQuery["security-token"] = config.securityToken;
  const canonicalQuery = Object.entries(signedQuery)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const canonicalResource = `/${config.bucket}/${objectKey}${canonicalQuery ? `?${canonicalQuery}` : ""}`;
  const signature = createHmac("sha1", config.accessKeySecret)
    .update(["GET", "", "", expires, canonicalResource].join("\n"))
    .digest("base64");
  const url = new URL(`${config.publicBaseUrl}/${encodeObjectKey(objectKey)}`);
  url.searchParams.set("OSSAccessKeyId", config.accessKeyId);
  url.searchParams.set("Expires", expires);
  for (const [key, value] of Object.entries(signedQuery)) url.searchParams.set(key, value);
  url.searchParams.set("Signature", signature);
  return url.toString();
}

function canonicalAssetUrl(assetId: string) {
  return `/api/media-assets/${assetId}`;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function encodeObjectKey(value: string) {
  return value.split("/").map(encodeURIComponent).join("/");
}

export const __directUploadTestUtils = {
  reset() {
    redis = undefined;
    redisConnecting = undefined;
    redisReconnectAfter = 0;
    localAdmissions.clear();
    mediaAssetRegistry = databaseMediaAssetRegistry;
  },
  setRedisClient(client: RedisCapacityClient | null) {
    redis = client;
  },
  setMediaAssetRegistry(registry: MediaAssetRegistry) {
    mediaAssetRegistry = registry;
  },
  resetMediaAssetRegistry() {
    mediaAssetRegistry = databaseMediaAssetRegistry;
  },
};
