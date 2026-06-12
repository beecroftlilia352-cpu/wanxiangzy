import { describe, expect, it } from "vitest";
import {
  DEFAULT_AUTO_DESIGN,
  buildAutoDesignPrompt,
  normalizeAutoDesignSettings,
  normalizeSceneMode,
  type TryOnSceneMode,
} from "../tryon-scene";

describe("try-on scene mode", () => {
  it("defaults unknown scene modes to system_reference", () => {
    expect(normalizeSceneMode(undefined)).toBe("system_reference");
    expect(normalizeSceneMode(null)).toBe("system_reference");
    expect(normalizeSceneMode("")).toBe("system_reference");
    expect(normalizeSceneMode("system")).toBe("system_reference");
    expect(normalizeSceneMode({ mode: "upload_reference" })).toBe("system_reference");
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
  it("keeps the default ecommerce clean preset on a white background", () => {
    expect(DEFAULT_AUTO_DESIGN).toMatchObject({
      platform: "ecommerce_clean",
      background: "white",
    });
  });

  it("normalizes ecommerce clean away from conflicting non-white backgrounds", () => {
    expect(normalizeAutoDesignSettings({
      platform: "ecommerce_clean",
      framing: "auto",
      background: "non_white",
    })).toMatchObject({
      platform: "ecommerce_clean",
      background: "white",
    });
  });

  it("builds the same ecommerce clean prompt even when a legacy non-white background is supplied", () => {
    const normalizedPrompt = buildAutoDesignPrompt({
      platform: "ecommerce_clean",
      framing: "auto",
      background: "white",
    });
    const legacyPrompt = buildAutoDesignPrompt({
      platform: "ecommerce_clean",
      framing: "auto",
      background: "non_white",
    });

    expect(legacyPrompt).toBe(normalizedPrompt);
  });

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
