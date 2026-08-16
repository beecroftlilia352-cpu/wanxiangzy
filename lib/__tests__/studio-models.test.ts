import { describe, expect, it } from "vitest";

import { STUDIO_IMAGE_MODEL_META } from "@/lib/studio-models";

describe("studio image model catalog", () => {
  it("exposes exactly the three user-facing models in display order", () => {
    expect(Object.entries(STUDIO_IMAGE_MODEL_META).map(([value, model]) => ({
      value,
      label: model.label,
    }))).toEqual([
      { value: "gpt-image-2", label: "GPT image 2" },
      { value: "nano-banana-2", label: "香蕉2" },
      { value: "nano-banana-pro", label: "香蕉Pro" },
    ]);
  });

  it("provides a description, badge, and visual for every model", () => {
    for (const model of Object.values(STUDIO_IMAGE_MODEL_META)) {
      expect(model.descKey).toMatch(/^Shared\.modelDesc\./);
      expect(model.badgeKey).toMatch(/^Shared\.modelBadge\./);
      expect(model.icon).toMatch(/^\/model-covers\/.+\.png$/);
    }
  });
});
