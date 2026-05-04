import { describe, expect, it } from "vitest";
import {
  applyImageRoleParams,
  buildPlanLines,
  normalizeAgentModule,
  resolveImageUrl,
  validateAgentDecision,
  validateImageRoleConflicts,
  type AgentImageInput,
} from "@/lib/agent/decision-utils";

const images: AgentImageInput[] = [
  { index: 1, url: "https://example.com/clothing.png", role: "clothing" },
  { index: 2, url: "https://example.com/reference.png", role: "reference" },
  { index: 3, url: "https://example.com/face.png", role: "face" },
  { index: 4, url: "https://example.com/bg.png", role: "background" },
];

const imageMap = new Map(images.map((img) => [img.index, img.url]));

describe("agent decision utils", () => {
  it("normalizes module aliases", () => {
    expect(normalizeAgentModule("换装")).toBe("tryon");
    expect(normalizeAgentModule("种草图")).toBe("grass");
    expect(normalizeAgentModule("3D")).toBe("garment_3d");
    expect(normalizeAgentModule("unknown")).toBeNull();
  });

  it("uses explicit image roles to fill tryon params", () => {
    const params = applyImageRoleParams("tryon", {}, images);
    expect(params.clothing_urls).toEqual(["图1"]);
    expect(params.reference_url).toBe("图2");
    expect(params.model_face_url).toBe("图3");
  });

  it("does not overwrite explicit LLM references", () => {
    const params = applyImageRoleParams("tryon", { clothing_urls: ["图2"], reference_url: "图1" }, images);
    expect(params.clothing_urls).toEqual(["图2"]);
    expect(params.reference_url).toBe("图1");
  });

  it("maps background roles for model background tasks", () => {
    const params = applyImageRoleParams("model_background", {}, images);
    expect(params.source_url).toBe("图1");
    expect(params.background_reference_url).toBe("图4");
  });

  it("resolves numbered and direct image refs", () => {
    expect(resolveImageUrl("图2", imageMap)).toBe("https://example.com/reference.png");
    expect(resolveImageUrl("https://example.com/raw.png", imageMap)).toBe("https://example.com/raw.png");
    expect(resolveImageUrl("图99", imageMap)).toBeNull();
  });

  it("validates missing image requirements", () => {
    expect(validateAgentDecision("tryon", {}, new Map()).ok).toBe(false);
    expect(validateAgentDecision("tryon", { clothing_urls: ["图1"] }, imageMap).ok).toBe(true);
    expect(validateAgentDecision("grass", { garment_url: "图1" }, imageMap).ok).toBe(true);
  });

  it("builds human-readable plan lines for confirmation cards", () => {
    const params = applyImageRoleParams("tryon", {}, images);
    const lines = buildPlanLines("tryon", params, images);
    expect(lines).toContain("**服装**：图1");
    expect(lines).toContain("**姿势/构图参考**：图2");
    expect(lines.some((line) => line.includes("图3=模特脸图"))).toBe(true);
  });

  it("blocks explicit role conflicts before generation confirmation", () => {
    const result = validateImageRoleConflicts(
      "tryon",
      { clothing_urls: ["图2"], reference_url: "图1" },
      images
    );
    expect(result.ok).toBe(false);
    expect(result.issues.join("\n")).toContain("图2");
  });

  it("allows correctly matched explicit roles", () => {
    const params = applyImageRoleParams("tryon", {}, images);
    expect(validateImageRoleConflicts("tryon", params, images).ok).toBe(true);
  });
});
