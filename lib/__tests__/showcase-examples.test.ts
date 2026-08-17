import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHOWCASE_MODULE,
  getBuiltInShowcaseExamples,
  getShowcaseModuleConfig,
  normalizeShowcaseModule,
} from "@/lib/showcase-examples";

describe("showcase examples", () => {
  it("keeps image-to-image as the safe fallback module", () => {
    expect(normalizeShowcaseModule("unknown-module")).toBe(DEFAULT_SHOWCASE_MODULE);
    expect(getShowcaseModuleConfig(null).configKey).toBe("studio.showcase.general-image-image-to-image");
  });

  it("loads the complete text-to-image showcase feed", () => {
    const config = getShowcaseModuleConfig("general-image-text-to-image");
    const examples = getBuiltInShowcaseExamples(config.module);

    expect(config.configKey).toBe("studio.showcase.general-image-text-to-image");
    expect(examples).toHaveLength(36);
    expect(new Set(examples.map((item) => item.id)).size).toBe(36);
    expect(examples.every((item) => item.imageUrl.startsWith("https://vasthk.oss-cn-hongkong.aliyuncs.com/"))).toBe(true);
    expect(examples.every((item) => item.referenceImageUrls.length === 0)).toBe(true);
  });
});
