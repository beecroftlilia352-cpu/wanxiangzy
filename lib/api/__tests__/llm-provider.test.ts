import { afterEach, describe, expect, it } from "vitest";
import { getLlmFallbackConfigs } from "@/lib/api/llm-provider";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("llm provider fallback config", () => {
  it("uses xiaomi first and Yunwu as fallback when both are configured", async () => {
    process.env.ANALYZE_LLM_PROVIDER = "xiaomi";
    process.env.XIAOMI_MIMO_API_KEY = "xiaomi-key";
    process.env.XIAOMI_MIMO_BASE_URL = "https://token-plan-sgp.xiaomimimo.com";
    process.env.XIAOMI_MIMO_TEXT_MODEL = "mimo-v2.5-pro";
    process.env.YUNWU_API_KEY = "yunwu-key";
    process.env.YUNWU_API_BASE_URL = "https://yunwu.ai";
    process.env.YUNWU_TEXT_MODEL = "gpt-5.4-nano";

    const configs = await getLlmFallbackConfigs("text");

    expect(configs.map((config) => config.provider)).toEqual(["xiaomi", "yunwu"]);
    expect(configs.map((config) => config.baseUrl)).toEqual([
      "https://token-plan-sgp.xiaomimimo.com/v1",
      "https://yunwu.ai/v1",
    ]);
  });

  it("uses Yunwu first and xiaomi as fallback when Yunwu is selected", async () => {
    process.env.ANALYZE_LLM_PROVIDER = "yunwu";
    process.env.XIAOMI_MIMO_API_KEY = "xiaomi-key";
    process.env.XIAOMI_MIMO_BASE_URL = "https://token-plan-sgp.xiaomimimo.com";
    process.env.XIAOMI_MIMO_TEXT_MODEL = "mimo-v2.5-pro";
    process.env.YUNWU_API_KEY = "yunwu-key";
    process.env.YUNWU_API_BASE_URL = "https://yunwu.ai";
    process.env.YUNWU_TEXT_MODEL = "gpt-5.4-nano";

    const configs = await getLlmFallbackConfigs("text");

    expect(configs.map((config) => config.provider)).toEqual(["yunwu", "xiaomi"]);
  });


  it("uses MiniMax M3 first and Xiaomi as fallback when minimax is selected", async () => {
    process.env.ANALYZE_LLM_PROVIDER = "minimax";
    process.env.MINIMAX_API_KEY = "minimax-key";
    process.env.MINIMAX_BASE_URL = "https://api.minimaxi.com";
    process.env.MINIMAX_VISION_MODEL = "MiniMax-M3";
    process.env.XIAOMI_MIMO_API_KEY = "xiaomi-key";
    process.env.XIAOMI_MIMO_BASE_URL = "https://api.xiaomimimo.com";
    process.env.XIAOMI_MIMO_VISION_MODEL = "mimo-v2.5";

    const configs = await getLlmFallbackConfigs("vision");

    expect(configs.map((config) => config.provider)).toEqual(["minimax", "xiaomi"]);
    expect(configs[0]).toMatchObject({
      baseUrl: "https://api.minimaxi.com/v1",
      model: "MiniMax-M3",
    });
  });
  it("keeps the legacy Lingya provider available when explicitly selected", async () => {
    process.env.ANALYZE_LLM_PROVIDER = "lingya";
    process.env.LINGYA_API_KEY = "lingya-key";
    process.env.LINGYA_BASE_URL = "https://api.lingyaai.cn";
    process.env.LINGYA_VISION_MODEL = "gpt-4o-mini";

    const configs = await getLlmFallbackConfigs("vision");

    expect(configs[0]).toMatchObject({
      provider: "lingya",
      baseUrl: "https://api.lingyaai.cn/v1",
      model: "gpt-4o-mini",
    });
  });
});
