import { describe, expect, it } from "vitest";
import {
  buildFaceSwapPrompt,
  DEFAULT_FACE_SWAP_TEXTURE_ENHANCE,
  enforceFaceSwapPromptRequirements,
  normalizeFaceSwapTextureEnhance,
} from "@/lib/face-swap";

describe("face swap prompt", () => {
  it("keeps garment detail recovery disabled by default", () => {
    const prompt = buildFaceSwapPrompt();

    expect(DEFAULT_FACE_SWAP_TEXTURE_ENHANCE).toBe(false);
    expect(prompt).not.toContain("服装轻量细节恢复规则");
    expect(prompt).toContain("Only perform a local facial-identity edit");
    expect(prompt).toContain("Source tone lock");
    expect(prompt).toContain("Fine textile safety");
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
    expect(prompt).toContain("Only perform a local facial-identity edit");
  });

  it("normalizes explicit texture enhancement values without swallowing true", () => {
    expect(normalizeFaceSwapTextureEnhance(true)).toBe(true);
    expect(normalizeFaceSwapTextureEnhance("true")).toBe(true);
    expect(normalizeFaceSwapTextureEnhance(false)).toBe(false);
    expect(normalizeFaceSwapTextureEnhance(undefined)).toBe(false);
  });
});
