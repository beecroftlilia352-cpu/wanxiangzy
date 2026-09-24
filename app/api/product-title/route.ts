import { NextResponse, type NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";
import { getKnownProductTitleModelIds } from "@/lib/product-title/models";
import { ProductTitleError, generateProductTitles } from "@/lib/product-title/server";
import { readProductTitleInput } from "@/lib/product-title/validation";
import { PRODUCT_TITLE_RATE_LIMIT, type ProductTitleResponse } from "@/lib/product-title/types";

/**
 * 「商品标题」接口（本功能自己的路由）。
 *
 * POST { images?: string[], description?: string, model?: string }
 *   →  { ok: true, model, titles: [{ en, zh, angle }] }
 * 失败 →  { ok: false, error: 中文提示, code }
 *
 * 条件说明（第二版需求）：不再自动读取结果图，改由用户在弹窗里给条件 —— 0~5 张图片、
 * 文字描述、deepseek 模型版本，三者至少给其一（图片或描述）；图片可用 data URL 内联
 * （前端 canvas 压缩后），也兼容站内相对路径 / http(s) 地址（沿用上版资产读取路径）。
 * 非 vision 模型（deepseek-v4-pro）不发送任何 image part，且只给图不给描述时直接 400。
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
  const parsed = readProductTitleInput(body, { allowedModelIds: getKnownProductTitleModelIds() });
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: parsed.error.error, code: parsed.error.code } satisfies ProductTitleResponse,
      { status: parsed.error.status },
    );
  }

  try {
    const result = await generateProductTitles({
      images: parsed.value.images,
      description: parsed.value.description,
      model: parsed.value.model,
    });
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
