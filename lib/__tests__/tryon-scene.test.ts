import { describe, expect, it } from "vitest";
import {
  DEFAULT_AUTO_DESIGN,
  buildAutoDesignPrompt,
  normalizeSceneMode,
  type TryOnSceneMode,
} from "../tryon-scene";

describe("try-on scene mode", () => {
  it("defaults unknown scene modes to auto_design", () => {
    expect(normalizeSceneMode(undefined)).toBe("auto_design");
    expect(normalizeSceneMode(null)).toBe("auto_design");
    expect(normalizeSceneMode("")).toBe("auto_design");
    expect(normalizeSceneMode("system")).toBe("auto_design");
    expect(normalizeSceneMode({ mode: "upload_reference" })).toBe("auto_design");
  });

  it("keeps supported scene modes unchanged", () => {
    const modes: TryOnSceneMode[] = [
      "system_reference",
      "upload_reference",
      "auto_design",
      "favorites",
    ];

    for (const mode of modes) {
      expect(normalizeSceneMode(mode)).toBe(mode);
    }
  });
});

describe("try-on auto design prompt", () => {
  it("states that auto design does not use a reference image", () => {
    const prompt = buildAutoDesignPrompt(DEFAULT_AUTO_DESIGN);

    expect(prompt).toContain("当前不使用参考图");
    expect(prompt).toContain("由 AI 根据服装类型、版型和商业展示需求");
    expect(prompt).toContain("自动设计最适合的模特姿势、构图、背景场景、镜头距离和灯光方案");
  });

  it("includes smart mode constraints that preserve the garment and body realism", () => {
    const prompt = buildAutoDesignPrompt(DEFAULT_AUTO_DESIGN);

    expect(prompt).toContain("智能模式只能决定拍摄方案");
    expect(prompt).toContain("不得改变服装图的版型、颜色、材质、图案和细节");
    expect(prompt).toContain("不得默认美白");
    expect(prompt).toContain("不得过度瘦身或改变真实体态");
  });
});
