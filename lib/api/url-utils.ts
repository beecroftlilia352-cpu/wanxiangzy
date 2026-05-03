/**
 * OpenAI-compatible API base URL 标准化工具
 * 统一处理各 provider 的 baseUrl 格式差异。
 */

export function normalizeOpenAiCompatibleBaseUrl(value: string): string {
  const baseUrl = value.replace(/\/+$/, "");
  if (!baseUrl) return "";
  return baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
}
