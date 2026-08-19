import { createHash } from "node:crypto";

import {
  databaseMediaAssetRegistry,
  type MediaAssetRegistry,
} from "@/lib/api/media-asset-registry.server";
import { storeMedia, type StoredMedia } from "@/lib/api/media-storage";

const DEFAULT_AUDIO_MAX_MB = 30;
const MAX_CONFIGURED_AUDIO_MB = 100;
const UPLOAD_LEASE_SECONDS = 900;

type CanonicalAudioMime = "audio/aac" | "audio/mp4" | "audio/mpeg" | "audio/wav";

const AUDIO_MIME_ALIASES: ReadonlyMap<string, CanonicalAudioMime> = new Map([
  ["audio/aac", "audio/aac"],
  ["audio/m4a", "audio/mp4"],
  ["audio/mpeg", "audio/mpeg"],
  ["audio/mp3", "audio/mpeg"],
  ["audio/mp4", "audio/mp4"],
  ["audio/wav", "audio/wav"],
  ["audio/wave", "audio/wav"],
  ["audio/x-m4a", "audio/mp4"],
  ["audio/x-wav", "audio/wav"],
] as const);

const AUDIO_EXTENSIONS: Record<CanonicalAudioMime, string> = {
  "audio/aac": "aac",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
};

export class AudioUploadError extends Error {
  constructor(
    public readonly code:
      | "CONFIGURATION"
      | "INVALID_AUDIO"
      | "TOO_LARGE"
      | "REGISTRY_UNAVAILABLE"
      | "STORAGE_UNAVAILABLE"
      | "SETTLEMENT_UNAVAILABLE"
      | "UPLOAD_MISMATCH",
    message: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "AudioUploadError";
  }
}

export type CanonicalAudioUpload = {
  status: "verified";
  media_asset_id: string;
  canonical_url: string;
  url: string;
  display_url: string;
  delete_url: "";
  width: 0;
  height: 0;
};

type AudioUploadDependencies = {
  registry?: MediaAssetRegistry;
  store?: typeof storeMedia;
};

/**
 * Validate, store, and settle a complete user-owned audio object.
 *
 * This function deliberately never returns `StoredMedia.url`: private OSS
 * signatures are transport capabilities, not durable application data.
 */
export async function uploadCanonicalAudio(
  input: {
    userId: string;
    bytes: Buffer;
    declaredContentType: string;
  },
  dependencies: AudioUploadDependencies = {},
): Promise<CanonicalAudioUpload> {
  const inspected = inspectAudioBytes(input.bytes, input.declaredContentType);
  const config = getAudioUploadConfig();
  const registry = dependencies.registry ?? databaseMediaAssetRegistry;
  const store = dependencies.store ?? storeMedia;
  const ownerHash = hashOwner(input.userId);
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const extension = AUDIO_EXTENSIONS[inspected.mimeType];
  const objectKey = `${config.objectPrefix}/${ownerHash}/audio-input/${sha256.slice(0, 2)}/${sha256}.${extension}`;
  const idempotencyKey = `upload:v1:audio:${createHash("sha256").update(objectKey).digest("hex")}`;

  let lease;
  try {
    lease = await registry.createUpload({
      ownerUserId: input.userId,
      idempotencyKey,
      objectKey,
      purpose: "audio_input",
      expectedSha256: sha256,
      expectedSizeBytes: input.bytes.length,
      expectedMimeType: inspected.mimeType,
      leaseSeconds: UPLOAD_LEASE_SECONDS,
      bucketName: config.bucketName,
    });
  } catch {
    throw new AudioUploadError("REGISTRY_UNAVAILABLE", "media asset registry is unavailable", 5);
  }

  if (lease.objectKey !== objectKey || lease.status === "quarantined" || lease.status === "deleted") {
    throw new AudioUploadError("UPLOAD_MISMATCH", "media asset registration does not match the upload");
  }
  if (lease.status === "verified") return canonicalAudioResult(lease.assetId);
  if (lease.status === "uploaded") {
    try {
      await registry.verifyAsset({ assetId: lease.assetId, fenceVersion: lease.fenceVersion });
    } catch {
      throw new AudioUploadError("SETTLEMENT_UNAVAILABLE", "media asset verification is unavailable", 5);
    }
    return canonicalAudioResult(lease.assetId);
  }
  if (lease.status !== "pending" || !lease.leaseToken) {
    throw new AudioUploadError("UPLOAD_MISMATCH", "media asset upload lease is unavailable");
  }

  let stored: StoredMedia;
  try {
    stored = await store({
      bytes: input.bytes,
      contentType: inspected.mimeType,
      name: `audio.${extension}`,
      storageClass: "upload",
      objectKey,
      forbidOverwrite: true,
    });
  } catch {
    // The registry row is still pending. Quarantine it if possible, but never
    // delete the immutable object: a lost OSS response can be ambiguous too.
    await registry.failUpload({
      assetId: lease.assetId,
      leaseToken: lease.leaseToken,
      fenceVersion: lease.fenceVersion,
      errorCode: "audio_storage_failed",
    }).catch(() => {});
    throw new AudioUploadError("STORAGE_UNAVAILABLE", "audio object storage is unavailable", 5);
  }

  if (!storedObjectMatches(stored, {
    objectKey,
    bucketName: config.bucketName,
    mimeType: inspected.mimeType,
    sizeBytes: input.bytes.length,
    sha256,
  })) {
    await registry.failUpload({
      assetId: lease.assetId,
      leaseToken: lease.leaseToken,
      fenceVersion: lease.fenceVersion,
      errorCode: "audio_storage_metadata_mismatch",
    }).catch(() => {});
    throw new AudioUploadError("UPLOAD_MISMATCH", "stored audio metadata does not match the upload");
  }

  let settlement;
  try {
    settlement = await registry.completeUpload({
      assetId: lease.assetId,
      leaseToken: lease.leaseToken,
      fenceVersion: lease.fenceVersion,
      sha256,
      sizeBytes: input.bytes.length,
      mimeType: inspected.mimeType,
    });
  } catch {
    // The fenced RPC may have committed while its response was lost. Preserve
    // the object and pending/uploaded row so the identical request can replay.
    throw new AudioUploadError("SETTLEMENT_UNAVAILABLE", "media asset settlement is unavailable", 5);
  }

  if (!settlement.metadataMatches || settlement.status === "quarantined") {
    throw new AudioUploadError("UPLOAD_MISMATCH", "stored audio metadata was quarantined");
  }
  if (settlement.status !== "verified") {
    try {
      await registry.verifyAsset({
        assetId: lease.assetId,
        fenceVersion: settlement.fenceVersion,
      });
    } catch {
      // Same uncertainty rule as completeUpload: do not fail or delete an
      // object after a fenced settlement may already have committed.
      throw new AudioUploadError("SETTLEMENT_UNAVAILABLE", "media asset verification is unavailable", 5);
    }
  }

  return canonicalAudioResult(lease.assetId);
}

export function audioUploadMaxBytes(env: NodeJS.ProcessEnv = process.env) {
  const raw = env.UPLOAD_AUDIO_MAX_MB?.trim();
  const megabytes = raw ? Number(raw) : DEFAULT_AUDIO_MAX_MB;
  if (!Number.isInteger(megabytes) || megabytes < 1 || megabytes > MAX_CONFIGURED_AUDIO_MB) {
    throw new AudioUploadError("CONFIGURATION", `UPLOAD_AUDIO_MAX_MB must be an integer between 1 and ${MAX_CONFIGURED_AUDIO_MB}`);
  }
  return megabytes * 1024 * 1024;
}

/** Full-buffer structural validation. File names/extensions are never trusted. */
export function inspectAudioBytes(bytes: Buffer, declaredContentType: string) {
  const maxBytes = audioUploadMaxBytes();
  if (!bytes.length) throw new AudioUploadError("INVALID_AUDIO", "audio content is empty");
  if (bytes.length > maxBytes) throw new AudioUploadError("TOO_LARGE", "audio exceeds the configured size limit");

  const declared = normalizeAudioMime(declaredContentType);
  if (!declared) throw new AudioUploadError("INVALID_AUDIO", "audio MIME type is unsupported");
  const detected = detectAndValidateAudio(bytes);
  if (detected !== declared) {
    throw new AudioUploadError("INVALID_AUDIO", "audio content does not match its MIME type");
  }
  return { mimeType: detected, sizeBytes: bytes.length };
}

function detectAndValidateAudio(bytes: Buffer): CanonicalAudioMime {
  if (isWave(bytes)) {
    validateWave(bytes);
    return "audio/wav";
  }
  if (isIsoBaseMedia(bytes)) {
    validateM4a(bytes);
    return "audio/mp4";
  }
  if (looksLikeId3(bytes) || validMpegAudioHeader(bytes, id3PayloadOffset(bytes))) {
    validateMp3(bytes);
    return "audio/mpeg";
  }
  if (looksLikeAdts(bytes) || bytes.subarray(0, 4).toString("ascii") === "ADIF") {
    validateAac(bytes);
    return "audio/aac";
  }
  throw new AudioUploadError("INVALID_AUDIO", "audio signature is not recognized");
}

function validateWave(bytes: Buffer) {
  if (bytes.length < 44 || bytes.readUInt32LE(4) + 8 !== bytes.length) invalidAudio("invalid WAV container length");
  let offset = 12;
  let hasFormat = false;
  let hasAudioData = false;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) invalidAudio("truncated WAV chunk");
    const chunkId = bytes.subarray(offset, offset + 4).toString("ascii");
    const chunkSize = bytes.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + chunkSize;
    if (dataEnd > bytes.length) invalidAudio("WAV chunk exceeds the file boundary");
    if (chunkId === "fmt ") {
      if (chunkSize < 16) invalidAudio("WAV format chunk is too small");
      const format = bytes.readUInt16LE(dataStart);
      const channels = bytes.readUInt16LE(dataStart + 2);
      const sampleRate = bytes.readUInt32LE(dataStart + 4);
      const byteRate = bytes.readUInt32LE(dataStart + 8);
      const blockAlign = bytes.readUInt16LE(dataStart + 12);
      const bitsPerSample = bytes.readUInt16LE(dataStart + 14);
      if (![1, 3, 6, 7, 0xfffe].includes(format) || channels < 1 || channels > 32
          || sampleRate < 1 || sampleRate > 768_000 || byteRate < 1 || blockAlign < 1
          || bitsPerSample < 1 || bitsPerSample > 64) {
        invalidAudio("invalid WAV format metadata");
      }
      hasFormat = true;
    } else if (chunkId === "data" && chunkSize > 0) {
      hasAudioData = true;
    }
    offset = dataEnd + (chunkSize % 2);
  }
  if (offset !== bytes.length || !hasFormat || !hasAudioData) invalidAudio("WAV is missing required audio chunks");
}

function validateM4a(bytes: Buffer) {
  const handlers = new Set<string>();
  let hasFtyp = false;
  let hasMediaData = false;
  forEachIsoBox(bytes, 0, bytes.length, (type, payloadStart, end) => {
    if (type === "ftyp") {
      hasFtyp = true;
      if (end - payloadStart < 8) invalidAudio("M4A ftyp box is truncated");
      const majorBrand = bytes.subarray(payloadStart, payloadStart + 4).toString("ascii");
      const supported = new Set(["M4A ", "M4B ", "M4P ", "isom", "iso2", "iso4", "iso5", "iso6", "mp41", "mp42", "qt  "]);
      if (!supported.has(majorBrand)) invalidAudio("unsupported M4A brand");
    }
    if (type === "mdat" && end > payloadStart) hasMediaData = true;
    collectIsoHandlers(bytes, type, payloadStart, end, handlers, 0);
  });
  if (!hasFtyp || !hasMediaData || !handlers.has("soun") || handlers.has("vide")) {
    invalidAudio("MP4 container is not an audio-only M4A file");
  }
}

function collectIsoHandlers(
  bytes: Buffer,
  type: string,
  payloadStart: number,
  end: number,
  handlers: Set<string>,
  depth: number,
) {
  if (depth > 8) invalidAudio("M4A box nesting is too deep");
  if (type === "hdlr") {
    if (payloadStart + 12 > end) invalidAudio("M4A handler box is truncated");
    handlers.add(bytes.subarray(payloadStart + 8, payloadStart + 12).toString("ascii"));
    return;
  }
  const containers = new Set(["moov", "trak", "mdia", "minf", "stbl", "edts", "dinf", "udta", "meta"]);
  if (!containers.has(type)) return;
  const childStart = type === "meta" ? payloadStart + 4 : payloadStart;
  if (childStart > end) invalidAudio("M4A container is truncated");
  forEachIsoBox(bytes, childStart, end, (childType, start, childEnd) => {
    collectIsoHandlers(bytes, childType, start, childEnd, handlers, depth + 1);
  });
}

function forEachIsoBox(
  bytes: Buffer,
  start: number,
  end: number,
  visitor: (type: string, payloadStart: number, end: number) => void,
) {
  let offset = start;
  while (offset < end) {
    if (offset + 8 > end) invalidAudio("truncated MP4 box");
    const size32 = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    let headerSize = 8;
    let boxSize = size32;
    if (size32 === 1) {
      if (offset + 16 > end) invalidAudio("truncated large MP4 box");
      const large = bytes.readBigUInt64BE(offset + 8);
      if (large > BigInt(Number.MAX_SAFE_INTEGER)) invalidAudio("MP4 box is too large");
      boxSize = Number(large);
      headerSize = 16;
    } else if (size32 === 0) {
      boxSize = end - offset;
    }
    if (boxSize < headerSize || offset + boxSize > end) invalidAudio("invalid MP4 box boundary");
    visitor(type, offset + headerSize, offset + boxSize);
    offset += boxSize;
  }
  if (offset !== end) invalidAudio("invalid MP4 container boundary");
}

function validateMp3(bytes: Buffer) {
  let offset = id3PayloadOffset(bytes);
  const audioEnd = bytes.length >= 128 && bytes.subarray(bytes.length - 128, bytes.length - 125).toString("ascii") === "TAG"
    ? bytes.length - 128
    : bytes.length;
  let frames = 0;
  while (offset < audioEnd) {
    const frameLength = mpegAudioFrameLength(bytes, offset);
    if (!frameLength || offset + frameLength > audioEnd) invalidAudio("invalid or truncated MP3 frame");
    offset += frameLength;
    frames += 1;
  }
  if (!frames || offset !== audioEnd) invalidAudio("MP3 contains no complete audio frames");
}

function validateAac(bytes: Buffer) {
  if (bytes.subarray(0, 4).toString("ascii") === "ADIF") {
    if (bytes.length < 16) invalidAudio("ADIF AAC file is truncated");
    return;
  }
  let offset = 0;
  let frames = 0;
  while (offset < bytes.length) {
    if (!looksLikeAdts(bytes, offset) || offset + 7 > bytes.length) invalidAudio("invalid AAC ADTS frame");
    const sampleRateIndex = (bytes[offset + 2] >> 2) & 0x0f;
    const channelConfig = ((bytes[offset + 2] & 0x01) << 2) | ((bytes[offset + 3] >> 6) & 0x03);
    const frameLength = ((bytes[offset + 3] & 0x03) << 11) | (bytes[offset + 4] << 3) | (bytes[offset + 5] >> 5);
    if (sampleRateIndex === 0x0f || channelConfig === 0 || frameLength < 7 || offset + frameLength > bytes.length) {
      invalidAudio("invalid AAC ADTS metadata");
    }
    offset += frameLength;
    frames += 1;
  }
  if (!frames || offset !== bytes.length) invalidAudio("AAC contains no complete ADTS frames");
}

function mpegAudioFrameLength(bytes: Buffer, offset: number) {
  if (!validMpegAudioHeader(bytes, offset)) return 0;
  const byte1 = bytes[offset + 1];
  const byte2 = bytes[offset + 2];
  const versionBits = (byte1 >> 3) & 0x03;
  const layerBits = (byte1 >> 1) & 0x03;
  const bitrateIndex = byte2 >> 4;
  const sampleRateIndex = (byte2 >> 2) & 0x03;
  const padding = (byte2 >> 1) & 0x01;
  const version = versionBits === 3 ? 1 : versionBits === 2 ? 2 : 2.5;
  const layer = layerBits === 3 ? 1 : layerBits === 2 ? 2 : 3;
  const bitrates = version === 1
    ? (layer === 1
      ? [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448]
      : layer === 2
        ? [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384]
        : [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320])
    : (layer === 1
      ? [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256]
      : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]);
  const sampleRates = version === 1 ? [44_100, 48_000, 32_000] : version === 2 ? [22_050, 24_000, 16_000] : [11_025, 12_000, 8_000];
  const bitrate = bitrates[bitrateIndex] * 1000;
  const sampleRate = sampleRates[sampleRateIndex];
  if (layer === 1) return Math.floor((12 * bitrate) / sampleRate + padding) * 4;
  const coefficient = layer === 3 && version !== 1 ? 72 : 144;
  return Math.floor((coefficient * bitrate) / sampleRate + padding);
}

function validMpegAudioHeader(bytes: Buffer, offset: number) {
  if (offset < 0 || offset + 4 > bytes.length) return false;
  const byte1 = bytes[offset + 1];
  const byte2 = bytes[offset + 2];
  const versionBits = (byte1 >> 3) & 0x03;
  const layerBits = (byte1 >> 1) & 0x03;
  const bitrateIndex = byte2 >> 4;
  const sampleRateIndex = (byte2 >> 2) & 0x03;
  return bytes[offset] === 0xff && (byte1 & 0xe0) === 0xe0
    && versionBits !== 1 && layerBits !== 0
    && bitrateIndex > 0 && bitrateIndex < 0x0f && sampleRateIndex !== 0x03
    && (bytes[offset + 3] & 0x03) !== 0x02;
}

function id3PayloadOffset(bytes: Buffer) {
  if (!looksLikeId3(bytes)) return 0;
  if (bytes.length < 10 || bytes[3] === 0xff || bytes[4] === 0xff
      || (bytes[6] | bytes[7] | bytes[8] | bytes[9]) & 0x80) {
    invalidAudio("invalid ID3 header");
  }
  const version = bytes[3];
  if (version < 2 || version > 4) invalidAudio("unsupported ID3 version");
  const size = (bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9];
  const footerSize = version === 4 && (bytes[5] & 0x10) !== 0 ? 10 : 0;
  const offset = 10 + size + footerSize;
  if (offset > bytes.length) invalidAudio("ID3 tag exceeds the file boundary");
  return offset;
}

function normalizeAudioMime(value: string): CanonicalAudioMime | null {
  const normalized = (value || "").split(";", 1)[0].trim().toLowerCase();
  return AUDIO_MIME_ALIASES.get(normalized) ?? null;
}

function isWave(bytes: Buffer) {
  return bytes.length >= 12
    && bytes.subarray(0, 4).toString("ascii") === "RIFF"
    && bytes.subarray(8, 12).toString("ascii") === "WAVE";
}

function isIsoBaseMedia(bytes: Buffer) {
  return bytes.length >= 16 && bytes.subarray(4, 8).toString("ascii") === "ftyp";
}

function looksLikeId3(bytes: Buffer) {
  return bytes.length >= 3 && bytes.subarray(0, 3).toString("ascii") === "ID3";
}

function looksLikeAdts(bytes: Buffer, offset = 0) {
  return offset + 2 <= bytes.length && bytes[offset] === 0xff && (bytes[offset + 1] & 0xf6) === 0xf0;
}

function getAudioUploadConfig() {
  if (process.env.NODE_ENV === "production" && (process.env.IMAGE_STORAGE_PROVIDER || "").trim().toLowerCase() !== "aliyun-oss") {
    throw new AudioUploadError("CONFIGURATION", "production audio uploads require Aliyun OSS");
  }
  const accessKeyId = process.env.ALIYUN_OSS_ACCESS_KEY_ID?.trim();
  const accessKeySecret = process.env.ALIYUN_OSS_ACCESS_KEY_SECRET?.trim();
  const bucketName = process.env.ALIYUN_OSS_BUCKET?.trim().toLowerCase();
  const region = process.env.ALIYUN_OSS_REGION?.trim();
  const publicBaseUrl = process.env.ALIYUN_OSS_PUBLIC_BASE_URL?.trim();
  if (!accessKeyId || !accessKeySecret || !bucketName || !region || !publicBaseUrl
      || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucketName)
      || !/^oss-[a-z0-9-]+$/.test(region)
      || !isSafeHttpsBaseUrl(publicBaseUrl)) {
    throw new AudioUploadError("CONFIGURATION", "Aliyun OSS audio upload configuration is incomplete");
  }
  const objectPrefix = cleanObjectPath(process.env.ALIYUN_OSS_UPLOAD_PREFIX || "ai-tryon/user-uploads/original");
  if (!objectPrefix || objectPrefix.split("/").some((part) => part === "." || part === "..")) {
    throw new AudioUploadError("CONFIGURATION", "Aliyun OSS upload prefix is invalid");
  }
  return { bucketName, objectPrefix };
}

function isSafeHttpsBaseUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password
      && !url.search && !url.hash;
  } catch {
    return false;
  }
}

function cleanObjectPath(value: string) {
  return value
    .split("/")
    .map((part) => part.trim().replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80))
    .filter(Boolean)
    .join("/");
}

function hashOwner(userId: string) {
  if (!userId || userId.length > 256) throw new AudioUploadError("INVALID_AUDIO", "invalid audio owner");
  return createHash("sha256").update(userId).digest("hex").slice(0, 24);
}

function storedObjectMatches(
  stored: StoredMedia,
  expected: { objectKey: string; bucketName: string; mimeType: string; sizeBytes: number; sha256: string },
) {
  return stored.object_key === expected.objectKey
    && stored.bucket_name === expected.bucketName
    && stored.content_type === expected.mimeType
    && stored.size_bytes === expected.sizeBytes
    && stored.sha256 === expected.sha256;
}

function canonicalAudioResult(assetId: string): CanonicalAudioUpload {
  const canonicalUrl = `/api/media-assets/${assetId}`;
  return {
    status: "verified",
    media_asset_id: assetId,
    canonical_url: canonicalUrl,
    url: canonicalUrl,
    display_url: canonicalUrl,
    delete_url: "",
    width: 0,
    height: 0,
  };
}

function invalidAudio(message: string): never {
  throw new AudioUploadError("INVALID_AUDIO", message);
}
