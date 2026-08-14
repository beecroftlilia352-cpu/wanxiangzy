import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { getAdminModelProviderOverride } from "@/lib/api/model-provider-registry.server";
import { normalizeOpenAiCompatibleBaseUrl } from "@/lib/api/url-utils";
import { IMAGE_MODEL_DISPLAY_ORDER, type PricedImageModel } from "@/lib/model-pricing";

export const maxDuration = 30;

/**
 * 供应商连接测试：用表单中的 Base URL + API Key 请求 /models，
 * 验证密钥有效性和接口可达性（不修改任何配置）。
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminApi("providers:write");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({})) as {
    model?: unknown;
    baseUrl?: unknown;
    apiKey?: unknown;
  };
  const model = typeof body.model === "string" ? body.model : "";
  const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl.trim() : "";
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";

  if (!model || !IMAGE_MODEL_DISPLAY_ORDER.includes(model as PricedImageModel)) {
    return NextResponse.json({ error: "模型不合法" }, { status: 400 });
  }
  if (!baseUrl) {
    return NextResponse.json({ error: "请先填写 Base URL" }, { status: 400 });
  }

  // 密钥留空时使用已保存的密钥
  let resolvedKey = apiKey;
  if (!resolvedKey) {
    const existing = await getAdminModelProviderOverride(model as PricedImageModel).catch(() => null);
    resolvedKey = existing?.apiKey || "";
  }
  if (!resolvedKey) {
    return NextResponse.json({ error: "请先填写该模型的 API Key" }, { status: 400 });
  }

  const normalized = normalizeOpenAiCompatibleBaseUrl(baseUrl);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(`${normalized}/models`, {
      headers: { Authorization: `Bearer ${resolvedKey}` },
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `连接失败（HTTP ${res.status}）：${text.slice(0, 160) || "请检查 Base URL 和密钥"}` },
        { status: 400 },
      );
    }
    const data = await res.json().catch(() => ({}));
    const count = Array.isArray(data?.data) ? data.data.length : 0;
    return NextResponse.json({
      ok: true,
      message: count > 0 ? `连接成功：接口可访问，共发现 ${count} 个模型` : "连接成功：接口可访问",
    });
  } catch (error) {
    const reason = error instanceof Error && error.name === "AbortError"
      ? "连接超时（10 秒），请检查网络或 Base URL"
      : error instanceof Error ? error.message : "网络错误";
    return NextResponse.json({ error: `连接失败：${reason}` }, { status: 400 });
  }
}
