import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";
import { ProductTitleError, generateProductTitles } from "@/lib/product-title/server";
import { readImageUrl } from "@/lib/product-title/validation";
import { PRODUCT_TITLE_RATE_LIMIT, type ProductTitleResponse } from "@/lib/product-title/types";

/**
 * 「商品标题」接口（新增路由，不改动任何既有路由）。
 *
 * POST { imageUrl }  →  { ok: true, model, titles: [{ en, zh, angle }] }
 * 失败               →  { ok: false, error: 中文提示, code }
 *
 * 鉴权：必须已登录（未登录 401）；限流：本功能自己的桶（触发 429 + 中文提示）；
 * 参数错 400 / 图片过大 413 / 上游或服务器错 502·500 / 超时 504。
 */

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const limit = await checkRateLimit(
    `${PRODUCT_TITLE_RATE_LIMIT.bucket}:${auth.user.id}`,
    PRODUCT_TITLE_RATE_LIMIT.limit,
    PRODUCT_TITLE_RATE_LIMIT.windowMs,
  );
  if (!limit.ok) {
    return rateLimitResponse(limit.retryAfterSeconds, {
      label: PRODUCT_TITLE_RATE_LIMIT.label,
      limit: PRODUCT_TITLE_RATE_LIMIT.limit,
      windowMs: PRODUCT_TITLE_RATE_LIMIT.windowMs,
    });
  }

  const body: unknown = await request.json().catch(() => null);
  const imageUrl = readImageUrl(body);
  if (!imageUrl) {
    return NextResponse.json(
      { ok: false, error: "请提供有效的图片地址（imageUrl）", code: "PRODUCT_TITLE_INVALID_INPUT" } satisfies ProductTitleResponse,
      { status: 400 },
    );
  }

  try {
    const result = await generateProductTitles(imageUrl);
    return NextResponse.json({
      ok: true,
      model: result.model,
      titles: result.titles,
    } satisfies ProductTitleResponse);
  } catch (error) {
    if (error instanceof ProductTitleError) {
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code } satisfies ProductTitleResponse,
        { status: error.status },
      );
    }
    console.error("[api/product-title] unexpected error:", error instanceof Error ? error.message : error);
    return NextResponse.json(
      { ok: false, error: "商品标题生成失败，请稍后重试。", code: "PRODUCT_TITLE_FAILED" } satisfies ProductTitleResponse,
      { status: 500 },
    );
  }
}
