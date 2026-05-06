import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

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
      .select("status,result_urls,error_message,job_payload")
      .eq("id", generationId)
      .eq("user_id", user.id)
      .single();

    if (!gen) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const asyncTask = readAsyncTask(gen.job_payload);
    const resultUrls = Array.isArray(gen.result_urls) ? gen.result_urls : [];
    const progress = resultUrls.length > 0 || gen.status === "completed"
      ? 100
      : readProgress(asyncTask?.progress);

    return NextResponse.json({
      status: gen.status,
      result_urls: resultUrls,
      error: gen.error_message,
      progress,
      provider_status: asyncTask?.status || null,
      task_id: asyncTask?.taskId || null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "查询失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function readAsyncTask(payload: unknown): { taskId?: string; status?: string; progress?: unknown } | null {
  if (!isRecord(payload) || !isRecord(payload.asyncTask)) return null;
  const task = payload.asyncTask;
  return {
    taskId: typeof task.taskId === "string" ? task.taskId : undefined,
    status: typeof task.status === "string" ? task.status : undefined,
    progress: task.progress,
  };
}

function readProgress(value: unknown) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.min(Math.max(Math.round(num), 0), 99);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
