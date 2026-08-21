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

  it("uses feature-specific models with the reference defaults", () => {
    expect(getGeneralImageDefaultSettings("text-to-image")).toEqual({
      model: "gpt-image-2",
      aspectRatio: "3:4",
      imageSize: "2K",
    });
    expect(getGeneralImageDefaultSettings("image-to-image")).toEqual({
      model: "nano-banana-2",
      aspectRatio: "3:4",
      imageSize: "2K",
    });
  });
});
