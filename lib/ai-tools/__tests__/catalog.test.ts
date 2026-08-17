import { describe, expect, it } from "vitest";
import {
  AI_TOOL_CATALOG,
  AI_TOOL_SLUGS,
  isAiToolSlug,
} from "@/lib/ai-tools/catalog";

describe("AI tool catalog", () => {
  it("exports all eight stable slugs", () => {
    expect(AI_TOOL_SLUGS).toEqual([
      "matting",
      "upscale",
      "outpaint",
      "erase",
      "repair-limbs",
      "repair-garment",
      "repair-footwear",
      "resize",
    ]);
    expect(Object.keys(AI_TOOL_CATALOG)).toEqual(AI_TOOL_SLUGS);
  });

  it("routes deterministic and generative capabilities to distinct providers", () => {
    expect(AI_TOOL_CATALOG.matting).toMatchObject({
      provider: "aliyun-segmentation",
      capability: "segment",
      requiresMask: false,
    });
    expect(AI_TOOL_CATALOG.erase).toMatchObject({
      provider: "generative-image-edit",
      capability: "inpaint",
      requiresMask: true,
    });
    expect(AI_TOOL_CATALOG["repair-limbs"]).toMatchObject({
      provider: "generative-image-edit",
      capability: "inpaint",
      requiresMask: true,
      acceptsMask: true,
      maxImages: 1,
    });
    expect(AI_TOOL_CATALOG.resize).toMatchObject({
      provider: "sharp",
      capability: "resize",
      requiresMask: false,
    });
  });

  it("exposes a type guard for frontend routing", () => {
    expect(isAiToolSlug("repair-footwear")).toBe(true);
    expect(isAiToolSlug("unknown-tool")).toBe(false);
    expect(isAiToolSlug(null)).toBe(false);
  });
});
