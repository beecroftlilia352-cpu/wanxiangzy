import { NextResponse } from "next/server";
import { createServerSupabase, createServerSupabaseAdmin } from "@/lib/supabase/server";
import { failGenerationWithRefund } from "@/lib/api/credits";

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const userResult = await withTimeout(
      supabase.auth.getUser(),
      10000,
      "认证服务响应超时"
    );
    const user = userResult.data.user;

    if (!user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const adminSupabase = await createServerSupabaseAdmin();
    await expireStaleProcessingRows(supabase, adminSupabase, user.id);

    const { data, error } = await withTimeout(
      supabase
        .from("generations")
        .select("id,status,error_message,credits_cost,credits_used,ai_model,image_size,result_urls,created_at,completed_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30),
      15000,
      "历史记录查询超时"
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rows: data || [] });
  } catch (err: any) {
    console.error("[history] error:", err);
    return NextResponse.json({ error: err.message || "历史记录加载失败" }, { status: 500 });
  }
}

async function expireStaleProcessingRows(supabase: any, adminSupabase: any, userId: string) {
  const staleBefore = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const { data: staleRows } = await supabase
    .from("generations")
    .select("id,credits_cost,credits_used,created_at,job_attempts,processing_started_at")
    .eq("user_id", userId)
    .eq("status", "processing_tryon")
    .gte("job_attempts", 3)
    .lt("processing_started_at", staleBefore)
    .limit(10);

  if (!staleRows?.length) return;

  for (const row of staleRows) {
    const amount = Number(row.credits_cost || row.credits_used || 0);
    await failGenerationWithRefund(adminSupabase, {
      userId,
      generationId: row.id,
      amount,
      reason: "生成任务超时自动退款",
      errorMessage: "任务超时未完成，积分已自动退回。请重新生成。",
    });
  }
}

function withTimeout<T>(promise: PromiseLike<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}
