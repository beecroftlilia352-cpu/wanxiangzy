import { describe, expect, it } from "vitest";
import {
  buildPoseGarmentAngleReferencePrompt,
  flattenGarmentAngleReferences,
  formatGarmentAngleReferenceLabel,
  normalizeGarmentAngleReferences,
} from "@/lib/garment-angle-references";

describe("garment angle references", () => {
  it("normalizes angle references with legacy string fallback", () => {
    const refs = normalizeGarmentAngleReferences([
      { url: " upper-back.png ", target: "upper", view: "back" },
      { url: "lower-side.png", target: "lower", view: "side" },
      "legacy.png",
      { url: "upper-back.png", target: "lower", view: "front" },
      { url: "", target: "upper", view: "front" },
    ]);

    expect(refs).toEqual([
      { url: "upper-back.png", target: "upper", view: "back" },
      { url: "lower-side.png", target: "lower", view: "side" },
      { url: "legacy.png", target: "outfit", view: "other" },
    ]);
    expect(flattenGarmentAngleReferences(refs)).toEqual(["upper-back.png", "lower-side.png", "legacy.png"]);
    expect(formatGarmentAngleReferenceLabel(refs[0], 0)).toBe("上装背面");
  });

  it("builds pose angle prompt with upper/lower isolation", () => {
    const prompt = buildPoseGarmentAngleReferencePrompt({
      startImageNumber: 2,
      references: [
        { url: "upper-back.png", target: "upper", view: "back" },
        { url: "lower-side.png", target: "lower", view: "side" },
      ],
    });

    expect(prompt).toContain("服装角度参考规则");
    expect(prompt).toContain("image 2 = 上装背面角度参考");
    expect(prompt).toContain("image 3 = 下装侧面角度参考");
    expect(prompt).toContain("不得影响其他服装区域");
    expect(prompt).toContain("图1可见正面外观优先");
    expect(prompt).toContain("正面姿势不要把背面结构强行放到正面");
    expect(prompt).toContain("只有当新姿势真实露出背面、侧面");
    expect(prompt).toContain("上装角度只影响上装");
    expect(prompt).toContain("下装角度只影响下装");
    expect(prompt).toContain("整套/连体角度用于保持连衣裙、连体裤、套装的整体结构连续性");
    expect(prompt).not.toContain("局部细节补充");
  });
});
