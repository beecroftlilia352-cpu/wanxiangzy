import { describe, expect, it } from "vitest";
import {
  getGeneralImageDefaultSettings,
  MAX_GENERAL_IMAGE_REFERENCE_IMAGES,
} from "@/lib/general-image-config";

describe("general image configuration", () => {
  it("supports the 14-image reference workflow", () => {
    expect(MAX_GENERAL_IMAGE_REFERENCE_IMAGES).toBe(14);
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
