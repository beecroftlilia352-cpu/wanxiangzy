import { describe, expect, it } from "vitest";
import { summarizeGenerationError } from "@/lib/studio-generation-feedback";

describe("summarizeGenerationError", () => {
  it("extracts nested upstream message from API error prefix", () => {
    const raw = 'API 错误 400: {"error":{"message":"Request blocked by sensitive word policy. Please adjust your prompt and try again.","type":"upstream_error"}}';
    const result = summarizeGenerationError(raw);
    expect(result).toContain("sensitive word policy");
    expect(result).not.toContain("上游模型繁忙或限流");
    expect(result).not.toContain("API 错误");
  });

  it("strips API error prefix and shows real reason for plain text errors", () => {
    const raw = "API 错误 400: Request blocked by sensitive word policy. Please adjust your prompt and try again.";
    const result = summarizeGenerationError(raw);
    expect(result).toContain("sensitive word policy");
    expect(result).not.toContain("API 错误");
  });

  it("keeps rate limit detection for real 429 errors", () => {
    expect(summarizeGenerationError("API 错误 429: too many requests")).toBe("上游模型繁忙或限流，本张已按失败结算。");
    expect(summarizeGenerationError('{"error":{"message":"当前分组上游负载已饱和，请稍后再试","type":"upstream_error"}}'))
      .toBe("上游模型繁忙或限流，本张已按失败结算。");
  });

  it("falls back to regex extraction when nested JSON is truncated", () => {
    const raw = 'API 错误 400: {"error":{"message":"Request blocked by sensitive word policy. Please adjust';
    const result = summarizeGenerationError(raw);
    expect(result).toContain("sensitive word policy");
  });
});
