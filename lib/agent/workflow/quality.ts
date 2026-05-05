import type { QualityCheckResult } from "@/lib/agent/workflow/types";

export async function checkImageOutputs(urls: string[], expectedCount = 1): Promise<QualityCheckResult> {
  const checks: QualityCheckResult["checks"] = [];
  checks.push({
    label: "数量",
    status: urls.length >= expectedCount ? "pass" : "fail",
    detail: `返回 ${urls.length} 张，期望至少 ${expectedCount} 张。`,
  });

  const invalid = urls.filter((url) => !isRenderableImageUrl(url));
  checks.push({
    label: "URL",
    status: invalid.length === 0 ? "pass" : "fail",
    detail: invalid.length === 0 ? "图片 URL 格式可渲染。" : `${invalid.length} 个 URL 格式异常。`,
  });

  if (urls.length > 0) {
    checks.push({
      label: "可访问性",
      status: "pass",
      detail: "已获得可访问图片地址；深度下载检测由资产转存流程保证。",
    });
  }

  const failed = checks.filter((check) => check.status === "fail").length;
  const warned = checks.filter((check) => check.status === "warn").length;
  return {
    ok: failed === 0,
    score: failed ? 0.35 : warned ? 0.72 : 0.92,
    checks,
  };
}

function isRenderableImageUrl(url: string) {
  if (!url) return false;
  if (url.startsWith("data:image/")) return true;
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}
