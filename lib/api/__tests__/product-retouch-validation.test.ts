import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { validateGeneratedProductImage } from "@/lib/api/product-retouch-validation";
import { BUILTIN_PRODUCT_RETOUCH_SKILL } from "@/lib/product-retouch";

describe("product retouch hard validation", () => {
  it("accepts a decodable non-blank PNG and returns deterministic metadata", async () => {
    const buffer = await sharp({
      create: {
        width: 320,
        height: 320,
        channels: 3,
        background: { r: 244, g: 244, b: 244 },
      },
    })
      .composite([{
        input: {
          create: {
            width: 120,
            height: 160,
            channels: 3,
            background: { r: 120, g: 40, b: 30 },
          },
        },
        left: 100,
        top: 80,
      }])
      .png()
      .toBuffer();

    const result = await validateGeneratedProductImage(
      `data:image/png;base64,${buffer.toString("base64")}`,
      BUILTIN_PRODUCT_RETOUCH_SKILL.hardValidation,
    );

    expect(result).toMatchObject({
      format: "png",
      width: 320,
      height: 320,
    });
    expect(result.sha256).toHaveLength(64);
    expect(result.variance).toBeGreaterThan(0.5);
  });

  it("rejects blank outputs", async () => {
    const buffer = await sharp({
      create: {
        width: 320,
        height: 320,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    }).png().toBuffer();

    await expect(validateGeneratedProductImage(
      `data:image/png;base64,${buffer.toString("base64")}`,
      BUILTIN_PRODUCT_RETOUCH_SKILL.hardValidation,
    )).rejects.toThrow("空白图");
  });

  it("rejects images below the minimum dimensions", async () => {
    const buffer = await sharp({
      create: {
        width: 128,
        height: 128,
        channels: 3,
        background: { r: 20, g: 30, b: 40 },
      },
    }).png().toBuffer();

    await expect(validateGeneratedProductImage(
      `data:image/png;base64,${buffer.toString("base64")}`,
      BUILTIN_PRODUCT_RETOUCH_SKILL.hardValidation,
    )).rejects.toThrow("尺寸过小");
  });

  it("rejects outputs that drift from an explicitly requested aspect ratio", async () => {
    const buffer = await sharp({
      create: {
        width: 320,
        height: 320,
        channels: 3,
        background: { r: 30, g: 60, b: 90 },
      },
    })
      .composite([{
        input: {
          create: {
            width: 120,
            height: 160,
            channels: 3,
            background: { r: 220, g: 150, b: 80 },
          },
        },
        left: 100,
        top: 80,
      }])
      .png()
      .toBuffer();

    await expect(validateGeneratedProductImage(
      `data:image/png;base64,${buffer.toString("base64")}`,
      BUILTIN_PRODUCT_RETOUCH_SKILL.hardValidation,
      { expectedAspectRatio: "3:4" },
    )).rejects.toThrow("比例不符合要求");
  });
});
