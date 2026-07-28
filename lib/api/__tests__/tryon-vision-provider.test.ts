import { afterEach, describe, expect, it } from "vitest";
import {
  buildTryOnClothingVisionProviderConfigs,
  buildTryOnReferenceVisionProviderConfigs,
} from "@/lib/api/tryon-vision-provider";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("try-on vision provider config", () => {
  it("does not add Lingya or gpt-4o-mini as automatic fallback for clothing analysis", () => {
    process.env.ANALYZE_LLM_PROVIDER = "lingya";
    process.env.TRYON_CLOTHING_ANALYZE_API_KEY = "tryon-key";
    process.env.TRYON_CLOTHING_ANALYZE_BASE_URL = "https://yunwu.ai";
    process.env.TRYON_CLOTHING_ANALYZE_MODEL = "gpt-5-nano";
    process.env.XIAOMI_MIMO_API_KEY = "xiaomi-key";
    process.env.XIAOMI_MIMO_BASE_URL = "https://api.xiaomimimo.com";
    process.env.XIAOMI_MIMO_VISION_MODEL = "mimo-v2.5";
    process.env.LINGYA_API_KEY = "lingya-key";
    process.env.LINGYA_BASE_URL = "https://api.lingyaai.cn";
    process.env.LINGYA_VISION_MODEL = "gpt-4o-mini";

    const configs = buildTryOnClothingVisionProviderConfigs("https://yunwu.ai/v1", "gpt-5-nano");

    expect(configs.map((config) => config.label)).toEqual(["tryon-clothing", "xiaomi"]);
    expect(configs.map((config) => config.model)).toEqual(["gpt-5-nano", "mimo-v2.5"]);
    expect(configs.some((config) => config.baseUrl.includes("lingyaai.cn"))).toBe(false);
    expect(configs.some((config) => config.model === "gpt-4o-mini")).toBe(false);
  });

  it("keeps reference analysis on explicit try-on providers plus Xiaomi only", () => {
    process.env.TRYON_REFERENCE_ANALYZE_API_KEY = "reference-key";
    process.env.TRYON_REFERENCE_ANALYZE_BASE_URL = "https://yunwu.ai";
    process.env.TRYON_REFERENCE_ANALYZE_MODEL = "gpt-5-nano";
    process.env.TRYON_CLOTHING_ANALYZE_API_KEY = "clothing-key";
    process.env.TRYON_CLOTHING_ANALYZE_BASE_URL = "https://api.xiaomimimo.com/v1";
    process.env.TRYON_CLOTHING_ANALYZE_MODEL = "mimo-v2.5";
    process.env.XIAOMI_MIMO_API_KEY = "xiaomi-key";
    process.env.XIAOMI_MIMO_BASE_URL = "https://api.xiaomimimo.com/v1";
    process.env.XIAOMI_MIMO_VISION_MODEL = "mimo-v2.5";
    process.env.LINGYA_API_KEY = "lingya-key";
    process.env.LINGYA_BASE_URL = "https://api.lingyaai.cn";
    process.env.LINGYA_VISION_MODEL = "gpt-4o-mini";

    const configs = buildTryOnReferenceVisionProviderConfigs("https://yunwu.ai/v1", "gpt-5-nano");

    expect(configs.map((config) => config.label)).toEqual(["tryon-reference", "tryon-clothing", "xiaomi"]);
    expect(configs.map((config) => config.model)).toEqual(["gpt-5-nano", "mimo-v2.5", "mimo-v2.5"]);
    expect(configs.some((config) => config.baseUrl.includes("lingyaai.cn"))).toBe(false);
    expect(configs.some((config) => config.model === "gpt-4o-mini")).toBe(false);
  });

  it("inherits Yunwu vision config when try-on overrides are not set", () => {
    delete process.env.TRYON_CLOTHING_ANALYZE_API_KEY;
    delete process.env.TRYON_CLOTHING_ANALYZE_BASE_URL;
    delete process.env.TRYON_CLOTHING_ANALYZE_MODEL;
    delete process.env.XIAOMI_MIMO_API_KEY;
    process.env.ANALYZE_LLM_PROVIDER = "yunwu";
    process.env.YUNWU_API_KEY = "yunwu-key";
    process.env.YUNWU_API_BASE_URL = "https://yunwu.ai";
    process.env.YUNWU_VISION_MODEL = "gpt-5.4-nano";

    const configs = buildTryOnClothingVisionProviderConfigs("https://yunwu.ai/v1", "gpt-5-nano");

    expect(configs).toEqual([expect.objectContaining({
      label: "yunwu",
      baseUrl: "https://yunwu.ai/v1",
      model: "gpt-5.4-nano",
    })]);
  });
});
