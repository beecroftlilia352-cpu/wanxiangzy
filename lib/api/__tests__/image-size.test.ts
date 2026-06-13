import { describe, expect, it } from "vitest";
import {
  parseImageDimensions,
  resolveClosestImageAspectRatio,
  resolveExactAspectPixelSize,
  resolveSmartImageAspectRatio,
  type ImageResolutionSize,
} from "../image-size";

const ASPECT_RATIOS = ["1:1", "9:16", "16:9", "4:3", "3:4", "2:3", "3:2", "4:5", "5:4", "21:9"] as const;
const IMAGE_SIZES: ImageResolutionSize[] = ["1K", "2K", "4K"];
const MAX_PIXELS = 3840 * 2160;

describe("image size resolver", () => {
  it("keeps every explicit aspect ratio exact across all image sizes", () => {
    for (const imageSize of IMAGE_SIZES) {
      for (const aspectRatio of ASPECT_RATIOS) {
        const [width, height] = parsePixelSize(resolveExactAspectPixelSize(imageSize, aspectRatio));
        const [ratioWidth, ratioHeight] = aspectRatio.split(":").map(Number);

        expect(width % 16, `${imageSize} ${aspectRatio} width`).toBe(0);
        expect(height % 16, `${imageSize} ${aspectRatio} height`).toBe(0);
        expect(width * ratioHeight, `${imageSize} ${aspectRatio} exact ratio`).toBe(height * ratioWidth);
        expect(width, `${imageSize} ${aspectRatio} max width`).toBeLessThanOrEqual(3840);
        expect(height, `${imageSize} ${aspectRatio} max height`).toBeLessThanOrEqual(3840);
        expect(width * height, `${imageSize} ${aspectRatio} max pixels`).toBeLessThanOrEqual(MAX_PIXELS);
      }
    }
  });

  it("returns stable sizes for common try-on ratios", () => {
    expect(resolveExactAspectPixelSize("1K", "3:4")).toBe("1152x1536");
    expect(resolveExactAspectPixelSize("2K", "3:4")).toBe("1536x2048");
    expect(resolveExactAspectPixelSize("4K", "3:4")).toBe("2448x3264");
    expect(resolveExactAspectPixelSize("1K", "4:5")).toBe("1216x1520");
    expect(resolveExactAspectPixelSize("1K", "9:16")).toBe("864x1536");
    expect(resolveExactAspectPixelSize("1K", "16:9")).toBe("1536x864");
  });

  it("keeps auto on default canvas sizes", () => {
    expect(resolveExactAspectPixelSize("1K", "auto")).toBe("1024x1024");
    expect(resolveExactAspectPixelSize("2K", "auto")).toBe("2048x2048");
    expect(resolveExactAspectPixelSize("4K", "auto")).toBe("3840x2160");
  });

  it("matches smart aspect ratio to the closest supported ratio", () => {
    expect(resolveClosestImageAspectRatio(896, 1200)).toBe("3:4");
    expect(resolveClosestImageAspectRatio(1024, 1536)).toBe("2:3");
    expect(resolveClosestImageAspectRatio(1792, 1008)).toBe("16:9");
  });

  it("reads data-url image dimensions for smart aspect ratio", async () => {
    const pngHeader = createPngHeader(768, 1024);
    const dataUrl = `data:image/png;base64,${Buffer.from(pngHeader).toString("base64")}`;

    expect(parseImageDimensions(pngHeader)).toEqual({ width: 768, height: 1024 });
    await expect(resolveSmartImageAspectRatio({ aspectRatio: "auto", image: dataUrl, fallback: "1:1" })).resolves.toBe("3:4");
    await expect(resolveSmartImageAspectRatio({ aspectRatio: "16:9", image: dataUrl, fallback: "1:1" })).resolves.toBe("16:9");
  });
});

function parsePixelSize(value: string): [number, number] {
  const [width, height] = value.split("x").map(Number);
  return [width, height];
}

function createPngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0x00, 0x00, 0x00, 0x0d], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  writeUInt32BE(bytes, 16, width);
  writeUInt32BE(bytes, 20, height);
  return bytes;
}

function writeUInt32BE(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}
