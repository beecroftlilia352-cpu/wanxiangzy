import { describe, expect, it } from "vitest";
import { buildTryOnInputReferences, getTryOnInputReferenceUrls } from "@/lib/tryon-input-references";

describe("tryon input reference snapshots", () => {
  it("keeps try-on references in the same semantic order as generation image inputs", () => {
    const references = buildTryOnInputReferences({
      clothingUrls: ["upper.png"],
      clothingMode: "multi",
      clothingRoles: ["upper"],
      referenceUrl: "scene.png",
      modelFaceUrl: "model.png",
    });

    expect(references).toEqual([
      { url: "upper.png", label: "上装" },
      { url: "scene.png", label: "参考图" },
      { url: "model.png", label: "模特" },
    ]);
  });

  it("labels upper and lower clothing slots before the scene and model references", () => {
    expect(getTryOnInputReferenceUrls({
      clothingUrls: ["upper.png", "lower.png"],
      clothingMode: "multi",
      clothingRoles: ["upper", "lower"],
      referenceUrl: "scene.png",
      modelFaceUrl: "model.png",
    })).toEqual(["upper.png", "lower.png", "scene.png", "model.png"]);
  });
});
