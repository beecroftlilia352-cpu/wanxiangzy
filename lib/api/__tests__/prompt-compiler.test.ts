import { describe, it, expect } from "vitest";
import { compileImagePromptForModel, type ImagePromptKind } from "@/lib/api/prompt-compiler";

describe("compileImagePromptForModel", () => {
  const shortPrompt =
    "图像角色：图1是服装图。核心任务：将图1服装穿到人物身上。服装还原规则：保留颜色和版型。负面约束：不要多余人物。图像质量：photorealistic, 8K ultra-detailed.";

  it("returns normalized prompt when kind is undefined", () => {
    const result = compileImagePromptForModel({
      kind: undefined,
      model: "gpt-image-2",
      prompt: shortPrompt,
    });
    expect(result).toBe(shortPrompt);
  });

  it("returns normalized prompt when kind is tryon", () => {
    const result = compileImagePromptForModel({
      kind: "tryon",
      model: "gpt-image-2",
      prompt: shortPrompt,
    });
    expect(result).toBe(shortPrompt);
  });

  it("truncates long prompt for gpt-image-2 to 6200 chars", () => {
    const longPrompt = "A".repeat(8000);
    const result = compileImagePromptForModel({
      kind: "grass",
      model: "gpt-image-2",
      prompt: longPrompt,
    });
    expect(result.length).toBeLessThanOrEqual(6200);
  });

  it("produces concise prompt for nano-banana-2 with required signals", () => {
    const result = compileImagePromptForModel({
      kind: "grass",
      model: "nano-banana-2",
      prompt: shortPrompt,
    });
    // Should contain kind header
    expect(result).toContain("种草");
    // Should contain quality line
    expect(result).toContain("photorealistic");
    // Should be within limit
    expect(result.length).toBeLessThanOrEqual(2300);
  });

  it("produces concise prompt for Seedream with required signals", () => {
    const result = compileImagePromptForModel({
      kind: "pose",
      model: "doubao-seedream-4-5-251128",
      prompt: shortPrompt,
    });
    expect(result).toContain("四宫格");
    expect(result).toContain("photorealistic");
    expect(result.length).toBeLessThanOrEqual(1900);
  });

  it("uses a single-image pose header for separate pose prompts", () => {
    const result = compileImagePromptForModel({
      kind: "pose",
      model: "nano-banana-2",
      prompt: "输出方式：每个姿势单独生成一张完整图片。不要生成四宫格。本次单图任务：只生成姿势2这一张完整图片。",
    });

    expect(result).toContain("生成一张独立的单姿势完整图片");
    expect(result).toContain("不要生成 2x2、四宫格、拼图、分屏或 contact sheet");
    expect(result).not.toContain("生成单张 2x2 四宫格姿势裂变图");
  });

  it("normalizes line breaks and excess whitespace", () => {
    const messyPrompt = "  Hello   world  \r\n\r\n\r\n  Test  ";
    const result = compileImagePromptForModel({
      kind: undefined,
      model: "gpt-image-2",
      prompt: messyPrompt,
    });
    // normalizePrompt collapses spaces to single space, then trims
    expect(result).toContain("Hello world");
    expect(result).toContain("Test");
    expect(result).not.toContain("\r");
    expect(result).not.toMatch(/\n{3,}/);
  });

  it("grass kind includes required image relationship signal", () => {
    const result = compileImagePromptForModel({
      kind: "grass",
      model: "nano-banana-2",
      prompt: "一些描述文字，没有图号",
    });
    // Should inject fallback signal for image relationship
    expect(result).toContain("图1");
  });

  it("garment3d kind includes required 3D signal", () => {
    const result = compileImagePromptForModel({
      kind: "garment3d",
      model: "nano-banana-2",
      prompt: "一些描述文字",
    });
    expect(result).toContain("3D");
    expect(result).toContain("无真人");
  });

  it("modelBackground kind includes required fusion signal", () => {
    const result = compileImagePromptForModel({
      kind: "modelBackground",
      model: "nano-banana-2",
      prompt: "一些描述文字",
    });
    expect(result).toContain("图1");
  });

  it("model kind includes required identity signal", () => {
    const result = compileImagePromptForModel({
      kind: "model",
      model: "nano-banana-2",
      prompt: "一些描述文字",
    });
    expect(result).toContain("参考图");
  });
});
