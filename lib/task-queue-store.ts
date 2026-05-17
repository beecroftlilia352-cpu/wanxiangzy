import type { SupabaseClient } from "@supabase/supabase-js";

import type { TaskQueueItem, TaskQueueSummary } from "@/lib/task-queue";
import { writeTaskQueueItem } from "@/lib/redis/task-queue-cache";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  type TaskQueueGenerationSourceRow,
  type TaskQueueIndexRow,
  type TaskQueueIndexWrite,
  type TaskQueueWorkflowSourceRow,
  applyStaleRunningFallback,
  emptyTaskQueueSummary,
  indexRowToTaskQueueItem,
  isRunningTaskStale,
  normalizeGenerationTaskQueueItem,
  normalizeModule,
  normalizeWorkflowTaskQueueItem,
  taskQueueItemToIndexWrite,
} from "@/lib/task-queue-index";

export const TASK_QUEUE_INDEX_COLUMNS = [
  "id",
  "user_id",
  "source_type",
  "source_id",
  "module",
  "title",
  "status",
  "status_group",
  "progress",
  "expected_count",
  "result_count",
  "input_thumbnails",
  "result_thumbnails",
  "error_message",
  "apply_url",
  "created_at",
  "updated_at",
  "completed_at",
].join(",");

const GENERATION_INDEX_SOURCE_COLUMNS = [
  "id",
  "user_id",
  "status",
  "error_message",
  "result_urls",
  "created_at",
  "updated_at",
  "completed_at",
  "processing_started_at",
  "job_payload",
  "clothing_urls",
  "model_face_url",
  "reference_url",
].join(",");

const WORKFLOW_INDEX_SOURCE_COLUMNS = [
  "id",
  "user_id",
  "status",
  "intent",
  "summary",
  "input_images",
  "error_message",
  "created_at",
  "updated_at",
  "final_outputs",
].join(",");

export type TaskQueueIndexLoadResult =
  | { ok: true; rows: TaskQueueItem[]; hasMore: boolean; nextCursor: string | null }
  | { ok: false; error: string };

export type TaskQueueSummaryLoadResult =
  | { ok: true; summary: TaskQueueSummary }
  | { ok: false; error: string };

export async function loadTaskQueueItemsFromIndex(
  supabase: SupabaseClient,
  params: {
    userId: string;
    module?: string;
    limit: number;
    cursor?: string | null;
    searchQuery?: string;
  },
): Promise<TaskQueueIndexLoadResult> {
  try {
    const module = params.module ? normalizeModule(params.module) : "";
    const queryLimit = params.searchQuery ? Math.min(Math.max(params.limit * 4, params.limit + 1), 100) : params.limit + 1;
    let query = (supabase as any)
      .from("task_queue_items")
      .select(TASK_QUEUE_INDEX_COLUMNS)
      .eq("user_id", params.userId)
      .order("created_at", { ascending: false })
      .limit(queryLimit);

    if (module) {
      query = query.eq("module", module);
    }
    if (params.cursor) {
      query = query.lt("created_at", params.cursor);
    }

    const { data, error } = await query;
    if (error) {
      return { ok: false, error: error.message || "task_queue_items query failed" };
    }

    const rawRows = (Array.isArray(data) ? data : []) as TaskQueueIndexRow[];
    let items = rawRows.map(indexRowToTaskQueueItem);
    if (params.searchQuery) {
      const search = params.searchQuery.trim().toLowerCase();
      items = items.filter((item) => matchesTaskSearch(item, search));
    }
    const rows = items.slice(0, params.limit);
    const hasMore = rawRows.length > params.limit || items.length > params.limit;
    return {
      ok: true,
      rows,
      hasMore,
      nextCursor: hasMore ? rows[rows.length - 1]?.createdAt || null : null,
    };
  } catch (error) {
    return { ok: false, error: toLogMessage(error) };
  }
}

export async function loadTaskQueueSummaryFromIndex(
  supabase: SupabaseClient,
  userId: string,
): Promise<TaskQueueSummaryLoadResult> {
  try {
    const [totalTaskNum, failedTaskNum, runningRowsResult] = await Promise.all([
      countIndexRows(
        (supabase as any)
          .from("task_queue_items")
          .select("id", { count: "planned", head: true })
          .eq("user_id", userId),
      ),
      countIndexRows(
        (supabase as any)
          .from("task_queue_items")
          .select("id", { count: "planned", head: true })
          .eq("user_id", userId)
          .eq("status_group", "failed"),
      ),
      (supabase as any)
        .from("task_queue_items")
        .select("source_id,module,title,status,status_group,progress,expected_count,result_count,input_thumbnails,result_thumbnails,error_message,apply_url,created_at,updated_at,completed_at,user_id,source_type")
        .eq("user_id", userId)
        .in("status_group", ["queued", "running"])
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    if (!totalTaskNum.ok) return { ok: false, error: totalTaskNum.error };
    if (!failedTaskNum.ok) return { ok: false, error: failedTaskNum.error };
    if (runningRowsResult.error) {
      return { ok: false, error: runningRowsResult.error.message || "task_queue_items running query failed" };
    }

    const runningRows = (Array.isArray(runningRowsResult.data) ? runningRowsResult.data : []) as TaskQueueIndexRow[];
    const runningItems = runningRows.map(indexRowToTaskQueueItem);
    const runningTaskNum = runningItems.filter(
      (item) => (item.statusGroup === "queued" || item.statusGroup === "running") && !isRunningTaskStale(item),
    ).length;
    const staleRunningTaskNum = runningItems.length - runningTaskNum;
    const failedCount = failedTaskNum.count + staleRunningTaskNum;
    const summary = {
      ...emptyTaskQueueSummary(),
      totalTaskNum: totalTaskNum.count,
      failedTaskNum: failedCount,
      runningTaskNum,
      finishedTaskNum: Math.max(0, totalTaskNum.count - failedCount - runningTaskNum),
    };
    return { ok: true, summary };
  } catch (error) {
    return { ok: false, error: toLogMessage(error) };
  }
}

export async function syncGenerationTaskQueueById(generationId: string): Promise<void> {
  const supabase = getAdminClient();
  const { data, error } = await (supabase as any)
    .from("generations")
    .select(GENERATION_INDEX_SOURCE_COLUMNS)
    .eq("id", generationId)
    .maybeSingle();

  if (error || !data) {
    console.warn("[task-queue-index] generation source unavailable:", error?.message || generationId);
    return;
  }

  const row = data as TaskQueueGenerationSourceRow;
  const item = normalizeGenerationTaskQueueItem(row);
  await upsertTaskQueueIndexItem(
    taskQueueItemToIndexWrite(item, { userId: row.user_id, sourceType: "generation", sourceId: row.id }),
  );
}

export async function syncWorkflowTaskQueueById(workflowId: string): Promise<void> {
  const supabase = getAdminClient();
  const { data, error } = await (supabase as any)
    .from("agent_workflows")
    .select(WORKFLOW_INDEX_SOURCE_COLUMNS)
    .eq("id", workflowId)
    .maybeSingle();

  if (error || !data) {
    console.warn("[task-queue-index] workflow source unavailable:", error?.message || workflowId);
    return;
  }

  const row = data as TaskQueueWorkflowSourceRow;
  const item = normalizeWorkflowTaskQueueItem(row);
  await upsertTaskQueueIndexItem(
    taskQueueItemToIndexWrite(item, { userId: row.user_id, sourceType: "workflow", sourceId: row.id }),
  );
}

export async function upsertTaskQueueIndexItem(item: TaskQueueIndexWrite): Promise<void> {
  const supabase = getAdminClient();
  const { error } = await (supabase as any)
    .from("task_queue_items")
    .upsert(item, { onConflict: "source_type,source_id" });

  if (error) {
    console.warn("[task-queue-index] upsert unavailable:", error.message);
    return;
  }

  await writeTaskQueueItem(item.user_id, applyStaleRunningFallback(indexRowToTaskQueueItem(item)));
}

async function countIndexRows(
  query: PromiseLike<{ count: number | null; error: { message?: string } | null }>,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  try {
    const { count, error } = await query;
    if (error) {
      return { ok: false, error: error.message || "task_queue_items count failed" };
    }
    return { ok: true, count: count || 0 };
  } catch (error) {
    return { ok: false, error: toLogMessage(error) };
  }
}

function matchesTaskSearch(item: TaskQueueItem, search: string) {
  if (!search) {
    return true;
  }
  return (
    item.id.toLowerCase().includes(search) ||
    item.title.toLowerCase().includes(search) ||
    item.status.toLowerCase().includes(search)
  );
}

function toLogMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "unknown error";
}
