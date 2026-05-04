import { describe, expect, it } from "vitest";
import { applyConfirmImageRoles, validateConfirmImageRoles } from "@/lib/agent/confirm-role-params";
import type { ChatImage } from "@/lib/agent/types";

const images: ChatImage[] = [
  { index: 1, url: "https://example.com/ref.png", fileName: "ref", role: "reference" },
  { index: 2, url: "https://example.com/top.png", fileName: "top", role: "clothing" },
  { index: 3, url: "https://example.com/pants.png", fileName: "pants", role: "clothing" },
  { index: 4, url: "https://example.com/face.png", fileName: "face", role: "face" },
];

describe("applyConfirmImageRoles", () => {
  it("rewrites tryon clothing, reference, and face urls from edited roles", () => {
    const result = applyConfirmImageRoles(
      "tryon",
      { clothing_urls: ["old"], reference_url: "old-ref" },
      { clothingUrls: ["old"] },
      images
    );

    expect(result.params.clothing_urls).toEqual([
      "https://example.com/top.png",
      "https://example.com/pants.png",
    ]);
    expect(result.params.reference_url).toBe("https://example.com/ref.png");
    expect(result.params.model_face_url).toBe("https://example.com/face.png");
    expect(result.jobPayload.clothingMode).toBe("multi");
  });

  it("keeps source and background distinct for background replacement", () => {
    const result = applyConfirmImageRoles(
      "model_background",
      {},
      {},
      [
        { index: 1, url: "https://example.com/source.png", role: "source" },
        { index: 2, url: "https://example.com/bg.png", role: "background" },
      ]
    );

    expect(result.params.source_url).toBe("https://example.com/source.png");
    expect(result.params.background_reference_url).toBe("https://example.com/bg.png");
  });

  it("reports role conflicts before confirmation", () => {
    const issues = validateConfirmImageRoles(
      "tryon",
      { clothing_urls: ["https://example.com/ref.png"] },
      images
    );

    expect(issues.some((issue) => issue.severity === "error")).toBe(true);
  });

  it("warns when multi-image tasks have no explicit roles", () => {
    const issues = validateConfirmImageRoles(
      "tryon",
      { clothing_urls: ["https://example.com/a.png"] },
      [
        { index: 1, url: "https://example.com/a.png" },
        { index: 2, url: "https://example.com/b.png" },
      ]
    );

    expect(issues).toContainEqual(expect.objectContaining({ severity: "warning" }));
  });
});
