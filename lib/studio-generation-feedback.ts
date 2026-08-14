export const FAILED_RETRY_NOTICE = "失败任务会自动退回对应灵点；重新生成会按新的生成任务再次扣费。";

export function summarizeGenerationError(message?: unknown) {
  const raw = typeof message === "string" ? message.trim() : "";
  if (!raw) return "上游生成服务返回异常，本张已按失败结算。";

  const nestedMessage = readNestedErrorMessage(raw);
  if (nestedMessage && nestedMessage !== raw) return summarizeGenerationError(nestedMessage);

  // 先剥离 "API 错误 NNN: " 前缀，让后续 JSON 解析和关键词判断更准
  const withoutApiPrefix = raw.replace(/^API 错误\s+\d+\s*[:：]\s*/, "");
  const lower = withoutApiPrefix.toLowerCase();

  // 限流类特征要精确：绝不能因为响应 JSON 里带 "upstream_error" 类型标签
  // 就把敏感词拦截、内容违规等具体原因误判成限流
  if (
    withoutApiPrefix.includes("429") ||
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("负载已饱和") ||
    lower.includes("请求过于频繁")
  ) {
    return "上游模型繁忙或限流，本张已按失败结算。";
  }

  const display = withoutApiPrefix || raw;
  return display.length > 96 ? `${display.slice(0, 96)}...` : display;
}

export function buildFailedTaskDetail(message?: unknown) {
  return `${summarizeGenerationError(message)} 本次失败已自动退回对应灵点；重新生成会按新任务扣费。`;
}

export function buildPartialFailureDetail(input: { message?: unknown; failedCount?: number }) {
  const failedCount = Math.max(1, Math.round(Number(input.failedCount) || 1));
  const reason = input.message ? summarizeGenerationError(input.message) : "";
  return [
    reason,
    `成功图片可正常使用，失败 ${failedCount} 张已自动退回对应灵点。`,
    "点“重试本张”会创建 1 张新任务并重新扣费。",
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
