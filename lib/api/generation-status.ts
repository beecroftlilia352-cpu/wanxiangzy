import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { normalizeGenerationState } from "@/lib/api/generation-state";
import { getAdminClient } from "@/lib/supabase/admin";

/**
 * 公共 GET 轮询：查询 generation 状态
 * 供 tryon / model / pose / garment-3d 四个路由复用
 */
export async function handleGenerationStatusGet(generationId: string | null) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    if (!generationId) {
      return NextResponse.json({ error: "Missing generation_id" }, { status: 400 });
    }

    const { data: gen } = await supabase
      .from("generations")
      .select("status,result_urls,error_message,job_payload,completed_at")
      .eq("id", generationId)
      .eq("user_id", user.id)
      .single();

    if (!gen) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const resultUrls = Array.isArray(gen.result_urls) ? gen.result_urls : [];
    const state = normalizeGenerationState({
      status: gen.status,
      resultUrls,
      payload: gen.job_payload,
      completedAt: gen.completed_at,
    });
    if (state.status === "completed" && String(gen.status || "").toLowerCase() !== "completed") {
      await reconcileCompletedGeneration(generationId, user.id);
    }

    return NextResponse.json({
      status: state.status,
      status_group: state.statusGroup,
      result_urls: resultUrls,
      module_results: state.moduleResults || [],
      expected_count: state.expectedCount,
      result_count: state.resultCount,
      partial_failure: readPartialFailure(gen.job_payload),
      error: gen.error_message,
      progress: state.progress,
      provider_status: state.providerStatus,
      task_id: state.taskId,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "查询失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function readPartialFailure(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as Record<string, unknown>).partialFailure;
  return value && typeof value === "object" ? value : null;
}

async function reconcileCompletedGeneration(generationId: string, userId: string) {
  try {
    await getAdminClient()
      .from("generations")
      .update({
        status: "completed",
        processing_started_at: null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", generationId)
      .eq("user_id", userId)
      .neq("status", "failed");
  } catch (err) {
    console.warn(
      "[generation-status] failed to reconcile completed generation",
      generationId,
      err instanceof Error ? err.message : err
    );
  }
}
