import { describe, expect, it } from "vitest";
import {
  generateDownloadFilename,
  ACCEPTED_IMAGE_TYPES,
  isLikelyImageFile,
} from "@/lib/utils";

describe("download utility", () => {
  describe("generateDownloadFilename", () => {
    it("produces a vwg-prefixed filename with module code, date, time and sequence", () => {
      const filename = generateDownloadFilename("product-retouch", 0);
      expect(filename).toMatch(/^vwg-ret-\d{4}-\d{4}-01\.png$/);
    });

    it("compacts module names to 2-3 letter codes", () => {
      const codes = [
        ["product-retouch", /vwg-ret-/],
        ["face-swap", /vwg-face-/],
        ["image-translation", /vwg-it-/],
        ["model-background", /vwg-bg-/],
        ["grouped-result", /vwg-gr-/],
      ] as const;
      for (const [input, pattern] of codes) {
        const filename = generateDownloadFilename(input, 0);
        expect(filename).toMatch(pattern);
      }
    });

    it("zero-pads the sequence number to 2 digits and adds 1", () => {
      expect(generateDownloadFilename("face-swap", 0)).toMatch(/-01\./);
      expect(generateDownloadFilename("face-swap", 9)).toMatch(/-10\./);
      expect(generateDownloadFilename("face-swap", 99)).toMatch(/-100\./);
    });

    it("defaults extension to png when none provided", () => {
      expect(generateDownloadFilename("face-swap", 0)).toMatch(/\.png$/);
    });

    it("normalizes extension casing", () => {
      expect(generateDownloadFilename("face-swap", 0, "PNG")).toMatch(/\.png$/);
      expect(generateDownloadFilename("face-swap", 0, "JPG")).toMatch(/\.jpg$/);
    });
  });

  describe("ACCEPTED_IMAGE_TYPES", () => {
    it("includes png / jpg / webp", () => {
      expect(ACCEPTED_IMAGE_TYPES["image/png"]).toEqual([".png"]);
      expect(ACCEPTED_IMAGE_TYPES["image/jpeg"]).toEqual([".jpg", ".jpeg"]);
      expect(ACCEPTED_IMAGE_TYPES["image/webp"]).toEqual([".webp"]);
    });
  });

  describe("isLikelyImageFile", () => {
    it("detects by mime type", () => {
      expect(isLikelyImageFile({ type: "image/png", name: "x.bin" })).toBe(true);
      expect(isLikelyImageFile({ type: "image/jpeg", name: "x" })).toBe(true);
    });

    it("detects by file extension fallback", () => {
      expect(isLikelyImageFile({ type: "", name: "foo.png" })).toBe(true);
      expect(isLikelyImageFile({ type: "", name: "foo.JPG" })).toBe(true);
      expect(isLikelyImageFile({ type: "", name: "foo.webp" })).toBe(true);
    });

    it("rejects non-image mime + non-image extension", () => {
      expect(isLikelyImageFile({ type: "application/pdf", name: "doc.pdf" })).toBe(false);
    });
  });
});
