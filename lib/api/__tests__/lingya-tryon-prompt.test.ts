import { describe, expect, it } from "vitest";
import { applyTryOnRequestPrompt, buildTryOnPrompt } from "../lingya";

describe("lingya try-on prompt framing", () => {
  it("preserves no-face or partial-body reference framing when no model face is selected", () => {
    const { prompt } = buildTryOnPrompt({
      clothingCount: 2,
      clothingMode: "multi",
      clothingRoles: ["upper", "lower"],
      hasReference: true,
      hasModelFace: false,
    });

    expect(prompt).toContain("Because no model-face reference is provided");
    expect(prompt).toContain("do not invent or reveal a missing face/head/full body");
    expect(prompt).toContain("the final image must keep the same no-face/partial-body framing");
    expect(prompt).toContain("Visible-frame rule");
    expect(prompt).toContain("preserve the lower-body/no-face/partial-body composition");
    expect(prompt).toContain("keep the output no-face/partial-body");
    expect(prompt).not.toContain("Preserve image 3's original facial identity, hair");
  });

  it("keeps the face-retargeting path unchanged when a model face is selected", () => {
    const { prompt } = buildTryOnPrompt({
      clothingCount: 2,
      clothingMode: "multi",
      clothingRoles: ["upper", "lower"],
      hasReference: true,
      hasModelFace: true,
    });

    expect(prompt).toContain("Use image 3 as the base try-on photo");
    expect(prompt).toContain("Reconstruct the final face using image 4's recognizable identity");
    expect(prompt).not.toContain("Because no model-face reference is provided");
    expect(prompt).not.toContain("the final image must keep the same no-face/partial-body framing");
  });

  it("adds no-face crop lock to final request directives for multi-candidate reference generation", () => {
    const prompt = applyTryOnRequestPrompt("Base try-on prompt.", {
      model: "nano-banana-2",
      referenceUrl: "https://example.com/lower-body-reference.png",
      candidateIndex: 1,
      candidateCount: 2,
    });

    expect(prompt).toContain("When no model-face reference is provided");
    expect(prompt).toContain("the final image must remain no-face/lower-body/partial-body");
    expect(prompt).toContain("Keep the same visible subject range, no-face/partial-body crop if present");
    expect(prompt).not.toContain("Keep the same facial identity");
  });
});
