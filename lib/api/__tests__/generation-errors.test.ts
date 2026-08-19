import { describe, expect, it } from "vitest";
import {
  isRetryableGenerationError,
  isStaleExecutionFenceError,
  RetryableGenerationError,
  sanitizeGenerationErrorMessage,
} from "../generation-errors";

describe("generation error policy", () => {
  it("redacts signed URLs, bearer tokens and secret pairs before persistence", () => {
    const message = sanitizeGenerationErrorMessage(
      "failed https://oss.example/a.png?OSSAccessKeyId=abc&Signature=secret Authorization: Bearer token-value api_key=top-secret",
    );

    expect(message).not.toContain("oss.example");
    expect(message).not.toContain("abc");
    expect(message).not.toContain("secret");
    expect(message).not.toContain("token-value");
    expect(message).toContain("[redacted-url]");
  });

  it("classifies infrastructure and provider transient failures as retryable", () => {
    expect(isRetryableGenerationError(new RetryableGenerationError("temporary"))).toBe(true);
    expect(isRetryableGenerationError(Object.assign(new Error("socket failed"), { code: "ECONNRESET" }))).toBe(true);
    expect(isRetryableGenerationError(new Error("供应商暂时不可用（HTTP 503）"))).toBe(true);
    expect(isRetryableGenerationError(new Error("更新任务进度失败: database unavailable"))).toBe(true);
  });

  it("keeps deterministic validation and authorization failures terminal", () => {
    expect(isRetryableGenerationError(new Error("图片尺寸超过安全上限"))).toBe(false);
    expect(isRetryableGenerationError(new Error("供应商拒绝了生成请求（HTTP 400）"))).toBe(false);
  });

  it("does not retry a stale execution fence after recovery takes ownership", () => {
    expect(isStaleExecutionFenceError({ code: "40001", message: "STALE_EXECUTION_FENCE" })).toBe(true);
    expect(isRetryableGenerationError({ code: "40001", message: "STALE_EXECUTION_FENCE" })).toBe(false);
    expect(isStaleExecutionFenceError(new Error("任务执行租约已丢失"))).toBe(true);
  });
});
