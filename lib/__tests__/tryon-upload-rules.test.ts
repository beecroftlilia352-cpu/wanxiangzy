import { describe, expect, it } from "vitest";
import {
  TRYON_CLOTHING_MODE_LABELS,
  TRYON_UPLOAD_RULES,
  TRYON_UPLOAD_SLOT_EXAMPLES,
} from "@/lib/tryon-upload-rules";

describe("tryon upload rules", () => {
  it("uses explicit upload modes for upper/lower and one-piece slots", () => {
    expect(TRYON_CLOTHING_MODE_LABELS.multi).toBe("换上下装");
    expect(TRYON_CLOTHING_MODE_LABELS.single).toBe("换连体");
    expect(TRYON_UPLOAD_RULES.multi.demos[0].images.map((image) => image.role)).toEqual(["upper", "lower"]);
    expect(TRYON_UPLOAD_RULES.single.demos[0].images[0].role).toBe("single");
  });

  it("serves recommended examples from our OSS bucket", () => {
    const urls = Object.values(TRYON_UPLOAD_SLOT_EXAMPLES).flat().map((image) => image.url);

    expect(urls).toHaveLength(15);
    for (const url of urls) {
      expect(url).toMatch(/^https:\/\/vasthk\.oss-cn-hongkong\.aliyuncs\.com\//);
      expect(url).toContain("/site-assets/original/");
    }
  });
});
