import { afterEach, describe, expect, it, vi } from "vitest";
import { generateDownloadFilename } from "@/lib/utils";

describe("download filenames", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses short module codes for generated image downloads", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 16, 17, 30, 5));

    expect(generateDownloadFilename("all-category-product-image", 0, "png")).toBe("vwg-cat-0616-1730-01.png");
    expect(generateDownloadFilename("outfit-fusion", 9, ".JPG")).toBe("vwg-mix-0616-1730-10.jpg");
  });

  it("keeps unknown prefixes compact and filesystem safe", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 16, 17, 30, 5));

    expect(generateDownloadFilename("Super Long Custom Module Name", 2, "webp")).toBe("vwg-slcmn-0616-1730-03.webp");
  });
});
