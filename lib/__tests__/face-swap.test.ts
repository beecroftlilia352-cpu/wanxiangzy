import { describe, expect, it } from "vitest";
import {
  buildFaceSwapPrompt,
  DEFAULT_FACE_SWAP_MODE,
  DEFAULT_FACE_SWAP_TEXTURE_ENHANCE,
  enforceFaceSwapPromptRequirements,
  getFaceSwapModeLabel,
  normalizeFaceSwapMode,
  normalizeFaceSwapTextureEnhance,
} from "@/lib/face-swap";

describe("face swap prompt", () => {
  it("keeps garment detail recovery disabled by default", () => {
    const prompt = buildFaceSwapPrompt();

    expect(DEFAULT_FACE_SWAP_TEXTURE_ENHANCE).toBe(false);
    expect(DEFAULT_FACE_SWAP_MODE).toBe("features");
    expect(prompt).not.toContain("服装轻量细节恢复规则");
    expect(prompt).toContain("Scope mode: facial features only");
    expect(prompt).toContain("Anti-identity-drift rule");
    expect(prompt).toContain("do not westernize");
    expect(prompt).toContain("Preserve ethnicity-specific facial geometry");
    expect(prompt).toContain("Source tone lock");
    expect(prompt).toContain("Fine textile safety");
    expect(prompt).toContain("Do not copy image 2 hairstyle");
    expect(prompt).not.toContain("8K ultra-detailed");
    expect(prompt).not.toContain("RAW photo quality");
    expect(prompt).not.toContain("high-frequency garment texture");
    expect(prompt).not.toContain("natural micro-contrast");
  });

  it("keeps conservative hard rules when detail recovery is explicitly enabled", () => {
    const prompt = enforceFaceSwapPromptRequirements(buildFaceSwapPrompt("保留冷感表情", true));

    expect(prompt).toContain("服装轻量细节恢复规则");
    expect(prompt).toContain("Hard rule: texture enhancement is active only as conservative local garment detail recovery");
    expect(prompt).toContain("do not apply beauty smoothing");
    expect(prompt).toContain("moire-prone fabric enhancement");
    expect(prompt).toContain("User extra instruction: 保留冷感表情");
    expect(prompt).not.toContain("8K ultra-detailed");
    expect(prompt).not.toContain("RAW photo quality");
    expect(prompt).not.toContain("high-frequency garment texture");
  });

  it("can be explicitly disabled for preservation-only jobs", () => {
    const prompt = buildFaceSwapPrompt("", false);

    expect(prompt).not.toContain("服装轻量细节恢复规则");
    expect(prompt).toContain("Scope mode: facial features only");
  });

  it("builds a dedicated hair and skin transfer prompt without old feature-only conflicts", () => {
    const prompt = enforceFaceSwapPromptRequirements(
      buildFaceSwapPrompt("保留原图服装和背景", false, "featuresHairSkin"),
      "featuresHairSkin"
    );

    expect(prompt).toContain("Scope mode: facial identity + hairstyle + skin tone");
    expect(prompt).toContain("Transfer the recognizable identity from image 2 plus its visible hairstyle");
    expect(prompt).toContain("Hard rule: mode is 换五官发型肤色");
    expect(prompt).toContain("do not westernize");
    expect(prompt).toContain("Preserve ethnicity-specific facial geometry");
    expect(prompt).toContain("no pasted head, mask edge");
    expect(prompt).not.toContain("Hard rule: mode is 仅换五官");
    expect(prompt).not.toContain("Do not copy image 2 hairstyle");
  });

  it("normalizes and labels face swap modes", () => {
    expect(normalizeFaceSwapMode(undefined)).toBe("features");
    expect(normalizeFaceSwapMode("仅换五官")).toBe("features");
    expect(normalizeFaceSwapMode("换五官发型肤色")).toBe("featuresHairSkin");
    expect(normalizeFaceSwapMode("appearance")).toBe("featuresHairSkin");
    expect(getFaceSwapModeLabel("featuresHairSkin")).toBe("换五官发型肤色");
  });

  it("normalizes explicit texture enhancement values without swallowing true", () => {
    expect(normalizeFaceSwapTextureEnhance(true)).toBe(true);
    expect(normalizeFaceSwapTextureEnhance("true")).toBe(true);
    expect(normalizeFaceSwapTextureEnhance(false)).toBe(false);
    expect(normalizeFaceSwapTextureEnhance(undefined)).toBe(false);
  });
});
