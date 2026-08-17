import { deflateSync } from "node:zlib";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const storageMocks = vi.hoisted(() => ({
  getImageStorageAdapter: vi.fn(),
  storeImage: vi.fn(),
}));

vi.mock("@/lib/api/image-storage", () => ({
  getImageStorageAdapter: storageMocks.getImageStorageAdapter,
  storeImage: storageMocks.storeImage,
}));

import {
  AI_TOOL_MASK_MAX_PIXELS,
  assertAiToolMaskSourcePixelLimit,
  parseAiToolMaskSourceDimension,
  validateAndStoreAiToolMask,
} from "@/lib/api/ai-tools/mask-upload.server";

describe("AI tool temporary mask upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMocks.getImageStorageAdapter.mockReturnValue({ provider: "aliyun-oss" });
    storageMocks.storeImage.mockResolvedValue({
      url: "https://bucket.example/temp/mask.png",
      display_url: "https://bucket.example/temp/mask.png",
      delete_url: "",
      width: 0,
      height: 0,
      object_key: "temp/original/2026/08/17/mask.png",
    });
  });

  it("decodes, binarizes and stores a non-empty PNG in the temp class", async () => {
    const bytes = await createMaskPng(4, 3, [[1, 1], [2, 1]]);

    const result = await validateAndStoreAiToolMask({
      bytes,
      declaredContentType: "image/png",
      sourceWidth: 4,
      sourceHeight: 3,
      userId: "user-1",
    });

    expect(result).toMatchObject({
      width: 4,
      height: 3,
      contentType: "image/png",
      selectedPixels: 2,
      objectKey: "temp/original/2026/08/17/mask.png",
    });
    expect(storageMocks.storeImage).toHaveBeenCalledTimes(1);
    const storedInput = storageMocks.storeImage.mock.calls[0][0];
    expect(storedInput).toMatchObject({
      contentType: "image/png",
      storageClass: "temp",
    });
    expect(storedInput.name).toMatch(/^ai-tool-mask-[a-f0-9]{12}-/);
    const metadata = await sharp(storedInput.bytes).metadata();
    expect(metadata).toMatchObject({ format: "png", width: 4, height: 3 });
  });

  it("rejects an empty black mask without writing storage", async () => {
    const bytes = await createMaskPng(4, 3, []);

    await expect(validateAndStoreAiToolMask({
      bytes,
      declaredContentType: "image/png",
      sourceWidth: 4,
      sourceHeight: 3,
      userId: "user-1",
    })).rejects.toMatchObject({ code: "AI_TOOL_MASK_SELECTION_EMPTY", status: 400 });
    expect(storageMocks.storeImage).not.toHaveBeenCalled();
  });

  it("rejects a decoded size that differs from the authoritative source size", async () => {
    const bytes = await createMaskPng(4, 3, [[1, 1]]);

    await expect(validateAndStoreAiToolMask({
      bytes,
      declaredContentType: "image/png",
      sourceWidth: 5,
      sourceHeight: 3,
      userId: "user-1",
    })).rejects.toMatchObject({ code: "AI_TOOL_MASK_DIMENSIONS_MISMATCH" });
    expect(storageMocks.storeImage).not.toHaveBeenCalled();
  });

  it("uses decoded magic and rejects non-PNG content even when MIME claims PNG", async () => {
    const jpeg = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "white" },
    }).jpeg().toBuffer();

    await expect(validateAndStoreAiToolMask({
      bytes: jpeg,
      declaredContentType: "image/png",
      sourceWidth: 2,
      sourceHeight: 2,
      userId: "user-1",
    })).rejects.toMatchObject({ code: "AI_TOOL_MASK_FORMAT_INVALID", status: 415 });
  });

  it("rejects animated PNG input", async () => {
    const animatedPng = createTwoFrameApng();

    await expect(validateAndStoreAiToolMask({
      bytes: animatedPng,
      declaredContentType: "image/png",
      sourceWidth: 1,
      sourceHeight: 1,
      userId: "user-1",
    })).rejects.toMatchObject({ code: "AI_TOOL_MASK_ANIMATED_NOT_ALLOWED" });
  });

  it("fails closed when a real temporary OSS class is unavailable", async () => {
    storageMocks.getImageStorageAdapter.mockReturnValue({ provider: "imgbb" });
    const bytes = await createMaskPng(2, 2, [[0, 0]]);

    await expect(validateAndStoreAiToolMask({
      bytes,
      declaredContentType: "image/png",
      sourceWidth: 2,
      sourceHeight: 2,
      userId: "user-1",
    })).rejects.toMatchObject({ code: "AI_TOOL_MASK_TEMP_STORAGE_NOT_CONFIGURED", status: 503 });
    expect(storageMocks.storeImage).not.toHaveBeenCalled();
  });

  it("strictly validates source dimensions and total pixels", () => {
    expect(parseAiToolMaskSourceDimension("2048", "source_width")).toBe(2048);
    expect(() => parseAiToolMaskSourceDimension("2048.0", "source_width"))
      .toThrowError(expect.objectContaining({ code: "AI_TOOL_MASK_SOURCE_DIMENSIONS_INVALID" }));
    expect(() => assertAiToolMaskSourcePixelLimit(AI_TOOL_MASK_MAX_PIXELS, 2))
      .toThrowError(expect.objectContaining({ code: "AI_TOOL_MASK_SOURCE_TOO_LARGE", status: 413 }));
  });
});

async function createMaskPng(width: number, height: number, selected: Array<[number, number]>) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index += 1) pixels[index * 4 + 3] = 255;
  for (const [x, y] of selected) {
    const offset = (y * width + x) * 4;
    pixels[offset] = 255;
    pixels[offset + 1] = 255;
    pixels[offset + 2] = 255;
  }
  return sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

function createTwoFrameApng() {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const animationControl = Buffer.alloc(8);
  animationControl.writeUInt32BE(2, 0);
  const firstFrameControl = frameControl(0);
  const secondFrameControl = frameControl(1);
  const firstFrame = deflateSync(Buffer.from([0, 255, 255, 255, 255]));
  const secondFrameData = deflateSync(Buffer.from([0, 0, 0, 0, 255]));
  const secondFrame = Buffer.alloc(4 + secondFrameData.length);
  secondFrame.writeUInt32BE(2, 0);
  secondFrameData.copy(secondFrame, 4);
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("acTL", animationControl),
    pngChunk("fcTL", firstFrameControl),
    pngChunk("IDAT", firstFrame),
    pngChunk("fcTL", secondFrameControl),
    pngChunk("fdAT", secondFrame),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function frameControl(sequence: number) {
  const control = Buffer.alloc(26);
  control.writeUInt32BE(sequence, 0);
  control.writeUInt32BE(1, 4);
  control.writeUInt32BE(1, 8);
  control.writeUInt16BE(1, 20);
  control.writeUInt16BE(10, 22);
  return control;
}

function pngChunk(type: string, data: Buffer) {
  const typeBytes = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])) >>> 0);
  return Buffer.concat([length, typeBytes, data, crc]);
}

function crc32(input: Buffer) {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
