import { afterEach, describe, expect, it, vi } from "vitest";

import {
  containsInlineImageUrl,
  findDisallowedProductionImageInputs,
  isAllowedProductionImageInput,
  normalizeGeneralImageReferenceUrls,
} from "@/lib/api/general-image-inputs";

describe("general image input boundary", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("keeps canonical/http references and caps the input count", () => {
    const result = normalizeGeneralImageReferenceUrls([
      " https://assets.example/one.png ",
      ...Array.from({ length: 20 }, (_, index) => `https://assets.example/${index}.png`),
    ]);

    expect(result.hasInlineImage).toBe(false);
    expect(result.urls).toHaveLength(14);
    expect(result.urls[0]).toBe("https://assets.example/one.png");
  });

  it("allows inline images only outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(normalizeGeneralImageReferenceUrls(["data:image/png;base64,abc"])).toEqual({
      urls: ["data:image/png;base64,abc"],
      hasInlineImage: true,
    });

    vi.stubEnv("NODE_ENV", "production");
    expect(normalizeGeneralImageReferenceUrls(["data:image/png;base64,abc"])).toEqual({
      urls: [],
      hasInlineImage: true,
    });
  });

  it("finds inline images in nested outfit assets", () => {
    expect(containsInlineImageUrl({ assets: [{ url: "data:image/png;base64,abc" }] })).toBe(true);
    expect(containsInlineImageUrl({ assets: [{ url: "https://assets.example/one.png" }] })).toBe(false);
  });

  it("accepts only canonical tenant assets and configured immutable site assets in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALIYUN_OSS_PUBLIC_BASE_URL", "https://assets.example.com");
    vi.stubEnv("ALIYUN_OSS_SITE_ASSET_PREFIX", "site-assets/original");

    expect(isAllowedProductionImageInput("/api/media-assets/018f47f1-b4c2-7a21-8f12-7a02169b89c1", "https://app.example")).toBe(true);
    expect(isAllowedProductionImageInput("https://assets.example.com/site-assets/original/guide.png", "https://app.example")).toBe(true);
    expect(isAllowedProductionImageInput("https://attacker.example/source.png", "https://app.example")).toBe(false);
    expect(findDisallowedProductionImageInputs({ assets: [{ url: "https://attacker.example/source.png" }] }, "https://app.example")).toEqual([
      "https://attacker.example/source.png",
    ]);
  });
});
