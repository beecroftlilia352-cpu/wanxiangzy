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
 *   →  { ok: true, model, titles: [{ title, zh, charCount, overLimit?, lint? }], repaired? }
 * 失败 →  { ok: false, error: 中文提示, code }
 *
 * 输出为**3 条纯英文标题 + 逐条中文对照 zh + 逐条字符数**（SHEIN 欧洲站规范，每条 ≤250 字符）。
 * zh 是该条英文标题的中文翻译对照（供运营阅读，不用于上架），只做容错透传：缺失时给空字符串，
 * 且**不参与**任何 lint / 长度判定（材质词、禁词、250 字符都只针对英文 title）。
 * 条件说明：不再自动读取结果图，改由用户在弹窗里给条件 —— 0~5 张图片、商品名称/商品信息、
 * deepseek 模型版本，三者至少给其一（图片或描述）；图片可用 data URL 内联（前端 canvas 压缩后），
 * 也兼容站内相对路径 / http(s) 地址（沿用上版资产读取路径）。
 * 非 vision 模型（deepseek-v4-pro）不发送任何 image part，且只给图不给描述时直接 400。
 * 本地 lint 命中材质词/尺寸数字/禁词或任意一条超长时，服务端会自动带逐条纠正指令重写一次
 * （最多 1 次）；重试后仍不合规就照常返回并在响应里标 repaired:false，不报错、也不静默改写标题。
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
      // 逐条原样透传：title / 中文对照 zh（缺失时兜底空字符串）/ 服务端复算的 charCount /
      // 该条是否超长 / 该条 lint（只针对英文 title）。
      titles: result.titles.map((item) => ({
        title: item.title,
        zh: typeof item.zh === "string" ? item.zh : "",
        charCount: item.charCount,
        overLimit: item.overLimit === true,
        lint: item.lint ?? { hasForbidden: false, hits: [] },
      })),
      ...(result.repaired === undefined ? {} : { repaired: result.repaired }),
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
