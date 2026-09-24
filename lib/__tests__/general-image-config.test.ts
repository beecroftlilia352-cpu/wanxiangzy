import { describe, expect, it } from "vitest";
import {
  getGeneralImageDefaultSettings,
  MAX_GENERAL_IMAGE_OUTPUT_COUNT,
  MAX_GENERAL_IMAGE_REFERENCE_IMAGES,
  MAX_GENERAL_IMAGE_SPLIT_REFERENCES,
  MAX_GENERAL_IMAGE_TOTAL_COUNT,
} from "@/lib/general-image-config";

describe("general image configuration", () => {
  it("supports fourteen merged references or six separately processed inputs", () => {
    expect(MAX_GENERAL_IMAGE_REFERENCE_IMAGES).toBe(14);
    expect(MAX_GENERAL_IMAGE_SPLIT_REFERENCES).toBe(6);
    expect(MAX_GENERAL_IMAGE_OUTPUT_COUNT).toBe(4);
    expect(MAX_GENERAL_IMAGE_TOTAL_COUNT).toBe(24);
  });

  // 默认比例/清晰度按产品要求改为 1:1 + 1K（标清），两个模式一致。
  it("uses feature-specific models with the reference defaults", () => {
    expect(getGeneralImageDefaultSettings("text-to-image")).toEqual({
      model: "gpt-image-2",
      aspectRatio: "1:1",
      imageSize: "1K",
    });
    expect(getGeneralImageDefaultSettings("image-to-image")).toEqual({
      model: "nano-banana-2",
      aspectRatio: "1:1",
      imageSize: "1K",
    });
  });
});
