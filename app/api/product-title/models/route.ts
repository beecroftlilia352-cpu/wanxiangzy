import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { fallbackProductTitleCatalog, fetchProductTitleModelCatalog } from "@/lib/product-title/models";
import { resolveDeepseekProvider } from "@/lib/product-title/server";
import {
  PRODUCT_TITLE_MODELS_TIMEOUT_MS,
  type ProductTitleModelsResponse,
} from "@/lib/product-title/types";

/**
 * GET /api/product-title/models（本功能自己的路由）
 *   → { ok: true, models: [{ id, name, vision, contextWindow, maxOutputTokens, effortLevels }], fallback }
 *
 * 与 POST /api/product-title 共用同一份能力表：直接问上游 GET {baseUrl}/models（解密后的 key
 * 只在服务端内存里用），并做 5 分钟内存缓存。上游失败 / 供应商未配置时回退到内置清单
 * （deepseek-flash 支持图片、deepseek-v4-pro 不支持），并在响应里标 fallback: true —— 前端
 * 拿到内置清单也能正常使用，不会因为清单拉不到就卡住。
 *
 * 鉴权：必须已登录。额度：读的是缓存好的清单，不占 product-title 生成桶的额度。
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  try {
    const provider = await resolveDeepseekProvider();
    const catalog = await fetchProductTitleModelCatalog({
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      timeoutMs: Math.min(provider.timeoutMs || PRODUCT_TITLE_MODELS_TIMEOUT_MS, PRODUCT_TITLE_MODELS_TIMEOUT_MS),
    });
    return NextResponse.json({
      ok: true,
      models: catalog.models,
      fallback: catalog.fallback,
    } satisfies ProductTitleModelsResponse);
  } catch {
    // 供应商未配置 / 控制面不可用：同样返回内置清单，前端不阻塞。
    return NextResponse.json({
      ok: true,
      models: fallbackProductTitleCatalog().models,
      fallback: true,
    } satisfies ProductTitleModelsResponse);
  }
}
