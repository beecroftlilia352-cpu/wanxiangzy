import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AudioUploadError,
  inspectAudioBytes,
  uploadCanonicalAudio,
} from "@/lib/api/audio-upload.server";
import type { MediaAssetRegistry } from "@/lib/api/media-asset-registry.server";
import type { storeMedia } from "@/lib/api/media-storage";

const ASSET_ID = "11111111-1111-4111-8111-111111111111";
const LEASE_TOKEN = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const ENV_KEYS = [
  "NODE_ENV",
  "IMAGE_STORAGE_PROVIDER",
  "ALIYUN_OSS_ACCESS_KEY_ID",
  "ALIYUN_OSS_ACCESS_KEY_SECRET",
  "ALIYUN_OSS_BUCKET",
  "ALIYUN_OSS_REGION",
  "ALIYUN_OSS_PUBLIC_BASE_URL",
  "ALIYUN_OSS_UPLOAD_PREFIX",
  "UPLOAD_AUDIO_MAX_MB",
] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

function createRegistry(): MediaAssetRegistry {
  return {
    createUpload: vi.fn(async (input) => ({
      assetId: ASSET_ID,
      status: "pending" as const,
      objectKey: input.objectKey,
      leaseToken: LEASE_TOKEN,
      fenceVersion: 1,
      leaseExpiresAt: new Date(Date.now() + 900_000).toISOString(),
      replayed: false,
    })),
    completeUpload: vi.fn(async () => ({
      assetId: ASSET_ID,
      status: "uploaded" as const,
      metadataMatches: true,
      fenceVersion: 2,
    })),
    verifyAsset: vi.fn(async () => ({
      assetId: ASSET_ID,
      status: "verified" as const,
      fenceVersion: 3,
    })),
    failUpload: vi.fn(async () => undefined),
  };
}

describe("canonical commercial audio uploads", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.IMAGE_STORAGE_PROVIDER = "aliyun-oss";
    process.env.ALIYUN_OSS_ACCESS_KEY_ID = "test-access-key";
    process.env.ALIYUN_OSS_ACCESS_KEY_SECRET = "test-secret";
    process.env.ALIYUN_OSS_BUCKET = "private-media-bucket";
    process.env.ALIYUN_OSS_REGION = "oss-cn-hongkong";
    process.env.ALIYUN_OSS_PUBLIC_BASE_URL = "https://private-media-bucket.oss-cn-hongkong.aliyuncs.com";
    process.env.ALIYUN_OSS_UPLOAD_PREFIX = "user-uploads/original";
    delete process.env.UPLOAD_AUDIO_MAX_MB;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const key of ENV_KEYS) restoreEnv(key, originalEnv[key]);
  });

  it("checks full WAV structure instead of trusting an extension or declared MIME", () => {
    const wav = makeWave();
    expect(inspectAudioBytes(wav, "audio/x-wav")).toEqual({
      mimeType: "audio/wav",
      sizeBytes: wav.length,
    });
    expect(() => inspectAudioBytes(Buffer.from("RIFF....WAVEfake"), "audio/wav"))
      .toThrowError(expect.objectContaining({ code: "INVALID_AUDIO" }));
    expect(() => inspectAudioBytes(wav, "audio/mpeg"))
      .toThrowError(expect.objectContaining({ code: "INVALID_AUDIO" }));
  });

  it("validates complete MP3, AAC ADTS, and audio-only M4A containers", () => {
    expect(inspectAudioBytes(makeMp3Frame(), "audio/mp3").mimeType).toBe("audio/mpeg");
    expect(inspectAudioBytes(makeAdtsFrame(), "audio/aac").mimeType).toBe("audio/aac");
    expect(inspectAudioBytes(makeM4a("soun"), "audio/x-m4a").mimeType).toBe("audio/mp4");
    expect(() => inspectAudioBytes(makeM4a("vide"), "audio/mp4"))
      .toThrowError(expect.objectContaining({ code: "INVALID_AUDIO" }));
  });

  it("uses an owner-scoped content-addressed immutable key and returns only the canonical URL", async () => {
    const bytes = makeWave();
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const registry = createRegistry();
    const store = vi.fn(async (input: Parameters<typeof storeMedia>[0]) => ({
      url: "https://oss.example/private.wav?Expires=123&Signature=secret",
      display_url: "https://oss.example/private.wav?Expires=123&Signature=secret",
      delete_url: "",
      width: 0,
      height: 0,
      object_key: input.objectKey,
      bucket_name: "private-media-bucket",
      content_type: "audio/wav",
      size_bytes: bytes.length,
      sha256,
    })) as typeof storeMedia;

    const result = await uploadCanonicalAudio({
      userId: USER_ID,
      bytes,
      declaredContentType: "audio/wav",
    }, { registry, store });

    expect(result).toEqual({
      status: "verified",
      media_asset_id: ASSET_ID,
      canonical_url: `/api/media-assets/${ASSET_ID}`,
      url: `/api/media-assets/${ASSET_ID}`,
      display_url: `/api/media-assets/${ASSET_ID}`,
      delete_url: "",
      width: 0,
      height: 0,
    });
    expect(JSON.stringify(result)).not.toContain("Signature");
    expect(registry.createUpload).toHaveBeenCalledWith(expect.objectContaining({
      ownerUserId: USER_ID,
      purpose: "audio_input",
      expectedSha256: sha256,
      expectedSizeBytes: bytes.length,
      expectedMimeType: "audio/wav",
      bucketName: "private-media-bucket",
      objectKey: expect.stringMatching(new RegExp(`^user-uploads/original/[a-f0-9]{24}/audio-input/${sha256.slice(0, 2)}/${sha256}\\.wav$`)),
    }));
    expect(store).toHaveBeenCalledWith(expect.objectContaining({
      bytes,
      contentType: "audio/wav",
      forbidOverwrite: true,
    }));
    expect(registry.completeUpload).toHaveBeenCalledWith(expect.objectContaining({
      assetId: ASSET_ID,
      leaseToken: LEASE_TOKEN,
      fenceVersion: 1,
      sha256,
    }));
    expect(registry.verifyAsset).toHaveBeenCalledWith({ assetId: ASSET_ID, fenceVersion: 2 });
  });

  it("preserves a committed object when the fenced registry settlement is uncertain", async () => {
    const bytes = makeWave();
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const registry = createRegistry();
    vi.mocked(registry.completeUpload).mockRejectedValueOnce(new Error("connection lost after commit"));
    const store = vi.fn(async (input: Parameters<typeof storeMedia>[0]) => ({
      url: "https://oss.example/private.wav?Signature=secret",
      display_url: "https://oss.example/private.wav?Signature=secret",
      delete_url: "",
      width: 0,
      height: 0,
      object_key: input.objectKey,
      bucket_name: "private-media-bucket",
      content_type: "audio/wav",
      size_bytes: bytes.length,
      sha256,
    })) as typeof storeMedia;

    await expect(uploadCanonicalAudio({
      userId: USER_ID,
      bytes,
      declaredContentType: "audio/wav",
    }, { registry, store })).rejects.toMatchObject({
      code: "SETTLEMENT_UNAVAILABLE",
      retryAfterSeconds: 5,
    });

    expect(store).toHaveBeenCalledOnce();
    expect(registry.failUpload).not.toHaveBeenCalled();
    expect(registry.verifyAsset).not.toHaveBeenCalled();
  });

  it("fails closed before creating a registry row when production OSS is misconfigured", async () => {
    delete process.env.ALIYUN_OSS_ACCESS_KEY_SECRET;
    const registry = createRegistry();
    const store = vi.fn() as unknown as typeof storeMedia;
    await expect(uploadCanonicalAudio({
      userId: USER_ID,
      bytes: makeWave(),
      declaredContentType: "audio/wav",
    }, { registry, store })).rejects.toBeInstanceOf(AudioUploadError);
    expect(registry.createUpload).not.toHaveBeenCalled();
    expect(store).not.toHaveBeenCalled();
  });
});

function makeWave() {
  const data = Buffer.from([0, 0, 1, 0]);
  const bytes = Buffer.alloc(44 + data.length);
  bytes.write("RIFF", 0, "ascii");
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVE", 8, "ascii");
  bytes.write("fmt ", 12, "ascii");
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8_000, 24);
  bytes.writeUInt32LE(16_000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36, "ascii");
  bytes.writeUInt32LE(data.length, 40);
  data.copy(bytes, 44);
  return bytes;
}

function makeMp3Frame() {
  // MPEG-1 Layer III, 128 kbps, 44.1 kHz, no padding = 417-byte frame.
  const frame = Buffer.alloc(417);
  frame.set([0xff, 0xfb, 0x90, 0x00]);
  return frame;
}

function makeAdtsFrame() {
  const frame = Buffer.alloc(9);
  const length = frame.length;
  frame[0] = 0xff;
  frame[1] = 0xf1;
  frame[2] = 0x50;
  frame[3] = 0x80 | ((length >> 11) & 0x03);
  frame[4] = (length >> 3) & 0xff;
  frame[5] = ((length & 0x07) << 5) | 0x1f;
  frame[6] = 0xfc;
  return frame;
}

function makeM4a(handler: "soun" | "vide") {
  const ftyp = isoBox("ftyp", Buffer.concat([
    Buffer.from("M4A ", "ascii"),
    Buffer.alloc(4),
    Buffer.from("M4A ", "ascii"),
  ]));
  const hdlr = isoBox("hdlr", Buffer.concat([
    Buffer.alloc(8),
    Buffer.from(handler, "ascii"),
    Buffer.alloc(4),
  ]));
  const moov = isoBox("moov", isoBox("trak", isoBox("mdia", hdlr)));
  const mdat = isoBox("mdat", Buffer.from([1, 2, 3, 4]));
  return Buffer.concat([ftyp, moov, mdat]);
}

function isoBox(type: string, payload: Buffer) {
  const result = Buffer.alloc(8 + payload.length);
  result.writeUInt32BE(result.length, 0);
  result.write(type, 4, "ascii");
  payload.copy(result, 8);
  return result;
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
