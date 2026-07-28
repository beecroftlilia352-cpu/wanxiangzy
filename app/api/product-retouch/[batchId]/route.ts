import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";

type RouteContext = {
  params: Promise<{ batchId: string }>;
};

const BATCH_COLUMNS = [
  "id",
  "parent_generation_id",
  "request_id",
  "status",
  "mode",
  "category",
  "variants_per_source",
  "ai_model",
  "aspect_ratio",
  "image_size",
  "user_instruction",
  "expected_count",
  "completed_count",
  "failed_count",
  "credits_cost",
  "refund_amount",
  "skill_version",
  "skill_content_hash",
  "created_at",
  "updated_at",
  "completed_at",
].join(",");

const OUTPUT_COLUMNS = [
  "id",
  "source_index",
  "source_client_id",
  "source_url",
  "source_filename",
  "variant_index",
  "generation_id",
  "status",
  "result_url",
  "error_message",
  "attempt_count",
  "validation_metadata",
  "created_at",
  "updated_at",
].join(",");

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { batchId } = await params;
  if (!isUuid(batchId)) return NextResponse.json({ error: "批次标识无效" }, { status: 400 });

  const supabase = await createServerSupabase({ readonlyCookies: true });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const limit = await checkRateLimit(`product-retouch-read:${user.id}`, 180, 60_000);
  if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

  const { data: batch, error } = await supabase
    .from("product_retouch_batches")
    .select(BATCH_COLUMNS)
    .eq("user_id", user.id)
    .or(`id.eq.${batchId},parent_generation_id.eq.${batchId}`)
    .maybeSingle();

  if (error) {
    console.error("[product-retouch] batch read error:", error.message);
    return NextResponse.json({ error: "商品精修批次读取失败" }, { status: 500 });
  }
  if (!batch) return NextResponse.json({ error: "商品精修批次不存在" }, { status: 404 });

  const batchRow = batch as unknown as BatchRow;
  const { data: outputs, error: outputsError } = await supabase
    .from("product_retouch_outputs")
    .select(OUTPUT_COLUMNS)
    .eq("user_id", user.id)
    .eq("batch_id", batchRow.id)
    .order("source_index", { ascending: true })
    .order("variant_index", { ascending: true });

  if (outputsError) {
    console.error("[product-retouch] outputs read error:", outputsError.message);
    return NextResponse.json({ error: "商品精修结果读取失败" }, { status: 500 });
  }

  return NextResponse.json({
    batch: serializeBatch(batchRow, (outputs || []) as unknown as OutputRow[]),
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}

type BatchRow = {
  id: string;
  parent_generation_id: string;
  request_id: string;
  status: string;
  mode: string;
  category: string;
  variants_per_source: number;
  ai_model: string;
  aspect_ratio: string;
  image_size: string;
  user_instruction: string;
  expected_count: number;
  completed_count: number;
  failed_count: number;
  credits_cost: number;
  refund_amount: number;
  skill_version: string;
  skill_content_hash: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

type OutputRow = {
  id: string;
  source_index: number;
  source_client_id: string;
  source_url: string;
  source_filename: string;
  variant_index: number;
  generation_id: string;
  status: string;
  result_url: string | null;
  error_message: string | null;
  attempt_count: number;
  validation_metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

function serializeBatch(batch: BatchRow, outputs: OutputRow[]) {
  return {
    id: batch.id,
    parentGenerationId: batch.parent_generation_id,
    requestId: batch.request_id,
    status: batch.status,
    mode: batch.mode,
    category: batch.category,
    variantsPerSource: batch.variants_per_source,
    model: batch.ai_model,
    aspectRatio: batch.aspect_ratio,
    imageSize: batch.image_size,
    userInstruction: batch.user_instruction,
    expectedCount: batch.expected_count,
    completedCount: batch.completed_count,
    failedCount: batch.failed_count,
    creditsCost: batch.credits_cost,
    refundAmount: batch.refund_amount,
    skillVersion: batch.skill_version,
    skillContentHash: batch.skill_content_hash,
    createdAt: batch.created_at,
    updatedAt: batch.updated_at,
    completedAt: batch.completed_at,
    outputs: outputs.map((output) => ({
      id: output.id,
      sourceIndex: output.source_index,
      sourceClientId: output.source_client_id,
      sourceUrl: output.source_url,
      sourceFilename: output.source_filename,
      variantIndex: output.variant_index,
      generationId: output.generation_id,
      status: output.status,
      resultUrl: output.result_url,
      error: output.error_message,
      attemptCount: output.attempt_count,
      validation: output.validation_metadata && Object.keys(output.validation_metadata).length
        ? output.validation_metadata
        : null,
      createdAt: output.created_at,
      updatedAt: output.updated_at,
    })),
  };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
