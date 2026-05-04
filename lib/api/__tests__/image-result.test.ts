import { describe, expect, it } from "vitest";
import { isRenderableImageUrl, normalizeGeneratedImageUrl } from "../image-result";

describe("image result helpers", () => {
  it("keeps http result URLs", () => {
    expect(normalizeGeneratedImageUrl({ url: "https://example.com/a.png" })).toBe("https://example.com/a.png");
  });

  it("keeps already-normalized data URLs without double-prefixing", () => {
    const dataUrl = "data:image/png;base64,aGVsbG8=";
    expect(normalizeGeneratedImageUrl({ b64_json: dataUrl })).toBe(dataUrl);
  });

  it("wraps raw base64 image payloads", () => {
    expect(normalizeGeneratedImageUrl({ b64_json: "aGVsbG8=" })).toBe("data:image/png;base64,aGVsbG8=");
  });

  it("rejects non-renderable URLs", () => {
    expect(() => normalizeGeneratedImageUrl({ url: "not-a-url" })).toThrow("无效图片地址");
    expect(isRenderableImageUrl("not-a-url")).toBe(false);
  });
});
