export const FAILED_RETRY_NOTICE = "失败任务会自动退回对应灵点；重新生成会按新的生成任务再次扣费。";
export const FAILED_RETRY_NOTICE_KEY = "LibShared.feedback.failedRetryNotice";

export const GENERATION_ERROR_UPSTREAM = "上游生成服务返回异常，本张已按失败结算。";
export const GENERATION_ERROR_UPSTREAM_KEY = "LibShared.feedback.upstreamError";
export const GENERATION_ERROR_RATE_LIMIT = "上游模型繁忙或限流，本张已按失败结算。";
export const GENERATION_ERROR_RATE_LIMIT_KEY = "LibShared.feedback.rateLimitError";
export const GENERATION_ERROR_CONTENT_POLICY = "提示词或输入图片可能包含模型暂不支持的敏感、受限或不符合内容政策的信息，请检查并调整后稍后再试。本张已按失败结算。";
export const FAILED_TASK_DETAIL_SUFFIX = "本次失败已自动退回对应灵点；重新生成会按新任务扣费。";
export const FAILED_TASK_DETAIL_SUFFIX_KEY = "LibShared.feedback.failedTaskDetailSuffix";
export const PARTIAL_FAILURE_REFUND_PREFIX = "成功图片可正常使用，失败";
export const PARTIAL_FAILURE_REFUND_SUFFIX = "张已自动退回对应灵点。";
export const PARTIAL_FAILURE_REFUND_KEY = "LibShared.feedback.partialFailureRefund";
export const PARTIAL_FAILURE_RETRY_HINT = "点“重试本张”会创建 1 张新任务并重新扣费。";
export const PARTIAL_FAILURE_RETRY_HINT_KEY = "LibShared.feedback.partialFailureRetryHint";

/**
 * Coerce an unknown `partial_failure.message` payload into a usable string.
 * Server may return either a bare string or a `{ message: "...", code: N }`
 * object; the previous inline `instanceof Object ? String(...) : ""` pattern
 * turned the object case into the literal "[object Object]".
 */
export function coerceErrorMessage(message: unknown): string {
  if (typeof message === "string") return message;
  if (message && typeof message === "object") {
    const nested = (message as { message?: unknown }).message;
    if (typeof nested === "string") return nested;
    const errorField = (message as { error?: unknown }).error;
    if (typeof errorField === "string") return errorField;
  }
  return "";
}

export function summarizeGenerationError(message?: unknown) {
  const raw = typeof message === "string" ? message.trim() : "";
  if (!raw) return GENERATION_ERROR_UPSTREAM;

  const nestedMessage = readNestedErrorMessage(raw);
  if (nestedMessage && nestedMessage !== raw) return summarizeGenerationError(nestedMessage);

  // 先剥离 "API 错误 NNN: " 前缀，让后续 JSON 解析和关键词判断更准
  const withoutApiPrefix = raw.replace(/^API 错误\s+\d+\s*[:：]\s*/, "");
  const lower = withoutApiPrefix.toLowerCase();

  if (
    /(?:HTTP|API\s*错误|status)?\s*[:：]?\s*451\b/i.test(raw) ||
    lower.includes("content policy") ||
    lower.includes("sensitive word policy") ||
    lower.includes("safety policy") ||
    lower.includes("内容政策") ||
    lower.includes("提示词违规")
  ) {
    return GENERATION_ERROR_CONTENT_POLICY;
  }

  // 限流类特征要精确：绝不能因为响应 JSON 里带 "upstream_error" 类型标签
  // 就把敏感词拦截、内容违规等具体原因误判成限流
  if (
    withoutApiPrefix.includes("429") ||
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("负载已饱和") ||
    lower.includes("请求过于频繁")
  ) {
    return GENERATION_ERROR_RATE_LIMIT;
  }

  const display = withoutApiPrefix || raw;
  return display.length > 96 ? `${display.slice(0, 96)}...` : display;
}

export function buildFailedTaskDetail(message?: unknown) {
  return `${summarizeGenerationError(message)} ${FAILED_TASK_DETAIL_SUFFIX}`;
}

export function buildPartialFailureDetail(input: { message?: unknown; failedCount?: number }) {
  const failedCount = Math.max(1, Math.round(Number(input.failedCount) || 1));
  const reason = input.message ? summarizeGenerationError(input.message) : "";
  return [
    reason,
    `${PARTIAL_FAILURE_REFUND_PREFIX} ${failedCount} ${PARTIAL_FAILURE_REFUND_SUFFIX}`,
    PARTIAL_FAILURE_RETRY_HINT,
  ].filter(Boolean).join(" ");
}

function readNestedErrorMessage(raw: string) {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return "";
  try {
    const parsed = JSON.parse(match[0]) as {
      error?: { message?: unknown } | string;
      message?: unknown;
    };
    if (typeof parsed.error === "object" && typeof parsed.error?.message === "string") return parsed.error.message;
    if (typeof parsed.error === "string") return parsed.error;
    if (typeof parsed.message === "string") return parsed.message;
  } catch {
    // JSON 截断/不完整时的降级：用正则提取 error message 或 message 字段的字符串值
    const messageField = match[0].match(/["']message["']\s*:\s*["']([^"']{4,})["']/i);
    if (messageField) return messageField[1];
    return "";
  }
  return "";
}
