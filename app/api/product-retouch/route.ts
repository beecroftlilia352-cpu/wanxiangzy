import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  getCreditCost,
  normalizeAspectRatio,
  normalizeImageSize,
  type ImageSize,
  type LingyaModel,
} from "@/lib/api/lingya";
import { assertUserCanGenerate, CreditError } from "@/lib/api/credits";
import { getPublicBaseUrlFromRequest } from "@/lib/api/image-inputs.server";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";
import {
  buildProductRetouchPrompt,
  isSupportedProductRetouchModel,
  normalizeProductRetouchCategory,
  normalizeProductRetouchInstruction,
  normalizeProductRetouchMode,
  normalizeProductRetouchSources,
  normalizeProductRetouchVariants,
} from "@/lib/product-retouch";
import { loadProductRetouchSkill } from "@/lib/product-retouch-skill.server";
import { getAdminClient } from "@/lib/supabase/admin";
import { isRecord } from "@/lib/utils";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const limit = await checkRateLimit(`product-retouch:${user.id}`, 12, 60_000);
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);
    await assertUserCanGenerate(user.id);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "请求格式无效" }, { status: 400 });
    }
    if (!isRecord(body)) return NextResponse.json({ error: "请求格式无效" }, { status: 400 });

    const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
    if (requestId.length < 8 || requestId.length > 120) {
      return NextResponse.json({ error: "请求标识无效" }, { status: 400 });
    }

    const skill = await loadProductRetouchSkill();
    const rawSources = Array.isArray(body.sources) ? body.sources : [];
    const sources = normalizeProductRetouchSources(
      rawSources,
      skill.definition.limits.maxSources,
    );
    if (!sources.length) {
      return NextResponse.json({ error: "请至少上传一张商品原图" }, { status: 400 });
    }
    if (rawSources.length !== sources.length) {
      return NextResponse.json({
        error: `商品图存在无效或重复项，单批最多 ${skill.definition.limits.maxSources} 张`,
      }, { status: 400 });
    }

    const requestedModel = body.model ?? skill.definition.modelPolicy.defaultModel;
    if (!isSupportedProductRetouchModel(requestedModel)
      || !skill.definition.modelPolicy.allowedModels.includes(requestedModel)) {
      return NextResponse.json({ error: "当前商品精修 Skill 不允许使用该模型" }, { status: 400 });
    }
    const model: LingyaModel = requestedModel;
    const mode = normalizeProductRetouchMode(body.mode);
    const category = normalizeProductRetouchCategory(body.category);
    const variantsPerSource = normalizeProductRetouchVariants(
      body.variantsPerSource,
      skill.definition.limits.maxVariantsPerSource,
    );
    const aspectRatio = normalizeAspectRatio(body.aspectRatio || "auto", "auto");
    const imageSize: ImageSize = normalizeImageSize(
      model,
      (typeof body.imageSize === "string" ? body.imageSize : "2K") as ImageSize,
      aspectRatio,
    );
    const userInstruction = normalizeProductRetouchInstruction(body.userInstruction);
    const unitCreditCost = getCreditCost(model, imageSize, aspectRatio);
    const prompts = sources.flatMap(() =>
      Array.from({ length: variantsPerSource }, (_, index) =>
        buildProductRetouchPrompt({
          definition: skill.definition,
          mode,
          category,
          userInstruction,
          variantIndex: index + 1,
        }),
      ),
    );

    const { data, error } = await getAdminClient().rpc("create_product_retouch_batch", {
      p_user_id: user.id,
      p_request_id: requestId,
      p_sources: sources,
      p_mode: mode,
      p_category: category,
      p_variants_per_source: variantsPerSource,
      p_ai_model: model,
      p_aspect_ratio: aspectRatio,
      p_image_size: imageSize,
      p_user_instruction: userInstruction,
      p_unit_credit_cost: unitCreditCost,
      p_public_base_url: getPublicBaseUrlFromRequest(request),
      p_skill_version: skill.definition.version,
      p_skill_content_hash: skill.contentHash,
      p_skill_config_version_id: skill.configVersionId,
      p_skill_snapshot: skill.definition,
      p_prompts: prompts,
    });

    if (error) throw normalizeProductRetouchRpcError(error.message, prompts.length * unitCreditCost);
    const row = Array.isArray(data) ? data[0] : data;
    if (!isCreateBatchResult(row)) {
      throw new Error("商品精修批次事务返回异常");
    }

    return NextResponse.json({
      batch_id: row.batch_id,
      generation_id: row.parent_generation_id,
      credits_remaining: row.credits_remaining,
      credits_cost: row.credits_cost,
      expected_count: prompts.length,
      status: "processing",
      skill: {
        version: skill.definition.version,
        content_hash: skill.contentHash,
        source: skill.source,
      },
    });
  } catch (error) {
    console.error("[product-retouch] POST error:", error instanceof Error ? error.message : error);
    if (error instanceof CreditError) {
      return NextResponse.json({
        error: error.message,
        required: error.required,
        balance: error.balance,
      }, { status: error.status });
    }
    return NextResponse.json({
      error: error instanceof Error ? error.message : "商品精修批次创建失败",
    }, { status: 500 });
  }
}

type CreateBatchResult = {
  batch_id: string;
  parent_generation_id: string;
  credits_remaining: number;
  credits_cost: number;
};

function isCreateBatchResult(value: unknown): value is CreateBatchResult {
  return isRecord(value)
    && typeof value.batch_id === "string"
    && typeof value.parent_generation_id === "string"
    && typeof value.credits_remaining === "number"
    && typeof value.credits_cost === "number";
}

function normalizeProductRetouchRpcError(message: string, required: number) {
  const insufficient = message.match(/INSUFFICIENT_CREDITS:(\d+)/);
  if (insufficient) {
    const balance = Number(insufficient[1]);
    return new CreditError(`灵点不足。需要 ${required}，余额 ${balance}`, 402, {
      required,
      balance,
    });
  }
  if (message.includes("create_product_retouch_batch")
    || message.includes("Could not find the function")) {
    return new Error("数据库缺少商品精修批次函数，请先运行 supabase/product-retouch.sql");
  }
  return new Error(message || "商品精修批次创建失败");
}
