import { afterEach, describe, expect, it } from "vitest";
import { getLlmFallbackConfigs } from "@/lib/api/llm-provider";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("llm provider fallback config", () => {
  it("uses xiaomi first and lingya as fallback when both are configured", () => {
    process.env.ANALYZE_LLM_PROVIDER = "xiaomi";
    process.env.XIAOMI_MIMO_API_KEY = "xiaomi-key";
    process.env.XIAOMI_MIMO_BASE_URL = "https://token-plan-sgp.xiaomimimo.com";
    process.env.XIAOMI_MIMO_TEXT_MODEL = "mimo-v2.5-pro";
    process.env.LINGYA_API_KEY = "lingya-key";
    process.env.LINGYA_BASE_URL = "https://api.lingyaai.cn";
    process.env.LINGYA_TEXT_MODEL = "gpt-4o-mini";

    const configs = getLlmFallbackConfigs("text");

    expect(configs.map((config) => config.provider)).toEqual(["xiaomi", "lingya"]);
    expect(configs.map((config) => config.baseUrl)).toEqual([
      "https://token-plan-sgp.xiaomimimo.com/v1",
      "https://api.lingyaai.cn/v1",
    ]);
  });

  it("uses lingya first and xiaomi as fallback when lingya is selected", () => {
    process.env.ANALYZE_LLM_PROVIDER = "lingya";
    process.env.XIAOMI_MIMO_API_KEY = "xiaomi-key";
    process.env.XIAOMI_MIMO_BASE_URL = "https://token-plan-sgp.xiaomimimo.com";
    process.env.XIAOMI_MIMO_TEXT_MODEL = "mimo-v2.5-pro";
    process.env.LINGYA_API_KEY = "lingya-key";
    process.env.LINGYA_BASE_URL = "https://api.lingyaai.cn";
    process.env.LINGYA_TEXT_MODEL = "gpt-4o-mini";

    const configs = getLlmFallbackConfigs("text");

    expect(configs.map((config) => config.provider)).toEqual(["lingya", "xiaomi"]);
  });
});
