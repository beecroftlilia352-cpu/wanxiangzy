import { describe, expect, it } from "vitest";
import { PRESET_MODELS, PRESET_REFERENCES } from "@/lib/tryon-studio-options";

const duplicatedProtocol = /https:\/\/[^"'`\s]+https:\/\//;

describe("tryon studio preset assets", () => {
  it("does not contain broken joined asset URLs", () => {
    const urls = [
      ...PRESET_MODELS.map((item) => item.image_url),
      ...PRESET_REFERENCES.map((item) => item.url),
    ];

    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url).toMatch(/^https:\/\//);
      expect(url).not.toMatch(duplicatedProtocol);
    }
  });
});
