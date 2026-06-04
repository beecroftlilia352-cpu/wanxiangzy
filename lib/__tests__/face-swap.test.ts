import { describe, expect, it } from "vitest";
import {
  buildFaceSwapPrompt,
  DEFAULT_FACE_SWAP_TEXTURE_ENHANCE,
  enforceFaceSwapPromptRequirements,
} from "@/lib/face-swap";

describe("face swap prompt", () => {
  it("enables garment texture enhancement by default", () => {
    const prompt = buildFaceSwapPrompt();

    expect(DEFAULT_FACE_SWAP_TEXTURE_ENHANCE).toBe(true);
    expect(prompt).toContain("服装质感增强规则");
    expect(prompt).toContain("显著提升服装材质解析力");
    expect(prompt).toContain("不要磨皮");
  });

  it("keeps hard texture enhancement rules when enforcing requirements", () => {
    const prompt = enforceFaceSwapPromptRequirements(buildFaceSwapPrompt("保留冷感表情"));

    expect(prompt).toContain("Hard rule: texture enhancement is active");
    expect(prompt).toContain("do not apply beauty smoothing");
    expect(prompt).toContain("User extra instruction: 保留冷感表情");
  });

  it("can be explicitly disabled for preservation-only jobs", () => {
    const prompt = buildFaceSwapPrompt("", false);

    expect(prompt).not.toContain("服装质感增强规则");
    expect(prompt).toContain("Only perform a local facial-identity edit");
  });
});
