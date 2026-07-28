import { afterEach, describe, expect, it } from "vitest";
import { getLlmFallbackConfigs } from "@/lib/api/llm-provider";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("llm provider fallback config", () => {
  it("uses xiaomi first and Yunwu as fallback when both are configured", () => {
    process.env.ANALYZE_LLM_PROVIDER = "xiaomi";
    process.env.XIAOMI_MIMO_API_KEY = "xiaomi-key";
    process.env.XIAOMI_MIMO_BASE_URL = "https://token-plan-sgp.xiaomimimo.com";
    process.env.XIAOMI_MIMO_TEXT_MODEL = "mimo-v2.5-pro";
    process.env.YUNWU_API_KEY = "yunwu-key";
    process.env.YUNWU_API_BASE_URL = "https://yunwu.ai";
    process.env.YUNWU_TEXT_MODEL = "gpt-5.4-nano";

    const configs = getLlmFallbackConfigs("text");

    expect(configs.map((config) => config.provider)).toEqual(["xiaomi", "yunwu"]);
    expect(configs.map((config) => config.baseUrl)).toEqual([
      "https://token-plan-sgp.xiaomimimo.com/v1",
      "https://yunwu.ai/v1",
    ]);
  });

  it("uses Yunwu first and xiaomi as fallback when Yunwu is selected", () => {
    process.env.ANALYZE_LLM_PROVIDER = "yunwu";
    process.env.XIAOMI_MIMO_API_KEY = "xiaomi-key";
    process.env.XIAOMI_MIMO_BASE_URL = "https://token-plan-sgp.xiaomimimo.com";
    process.env.XIAOMI_MIMO_TEXT_MODEL = "mimo-v2.5-pro";
    process.env.YUNWU_API_KEY = "yunwu-key";
    process.env.YUNWU_API_BASE_URL = "https://yunwu.ai";
    process.env.YUNWU_TEXT_MODEL = "gpt-5.4-nano";

    const configs = getLlmFallbackConfigs("text");

    expect(configs.map((config) => config.provider)).toEqual(["yunwu", "xiaomi"]);
  });

  it("keeps the legacy Lingya provider available when explicitly selected", () => {
    process.env.ANALYZE_LLM_PROVIDER = "lingya";
    process.env.LINGYA_API_KEY = "lingya-key";
    process.env.LINGYA_BASE_URL = "https://api.lingyaai.cn";
    process.env.LINGYA_VISION_MODEL = "gpt-4o-mini";

    const configs = getLlmFallbackConfigs("vision");

    expect(configs[0]).toMatchObject({
      provider: "lingya",
      baseUrl: "https://api.lingyaai.cn/v1",
      model: "gpt-4o-mini",
    });
  });
});
