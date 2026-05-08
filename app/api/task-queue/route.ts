import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  GENERATION_FAILED_STATUS_FILTERS,
  GENERATION_RUNNING_STATUS_FILTERS,
  normalizeGenerationState,
} from "@/lib/api/generation-state";

const QUEUE_COLUMNS = [
  "id",
  "status",
  "error_message",
  "result_urls",
  "created_at",
  "completed_at",
  "processing_started_at",
  "job_payload",
  "clothing_urls",
  "model_face_url",
  "reference_url",
].join(",");

const SUMMARY_GENERATION_COLUMNS = [
  "status",
  "result_urls",
  "created_at",
  "completed_at",
  "processing_started_at",
  "job_payload",
].join(",");

const SUMMARY_WORKFLOW_COLUMNS = [
  "status",
  "created_at",
  "updated_at",
].join(",");

type QueueRow = {
  id: string;
  status: string;
  error_message?: string | null;
  result_urls?: string[] | null;
  created_at: string;
  completed_at?: string | null;
  processing_started_at?: string | null;
  job_payload?: Record<string, unknown> | null;
  clothing_urls?: string[] | null;
  model_face_url?: string | null;
  reference_url?: string | null;
};

type WorkflowRow = {
  id: string;
  status: string;
  intent?: string | null;
  summary?: string | null;
  input_images?: unknown[] | null;
  final_outputs?: Record<string, unknown> | null;
  cost_reserved?: number | null;
  cost_settled?: number | null;
  error_message?: string | null;
  created_at: string;
  updated_at?: string | null;
};

type QueueItem = {
  id: string;
  title: string;
  status: string;
  statusGroup: "running" | "finished";
  time: string;
  createdAt: string;
  completedAt?: string | null;
  error: string;
  progress?: number;
  thumbnails: string[];
};

type QueueSummaryData = {
  totalTaskNum: number;
  finishedTaskNum: number;
  finishedNeedReadTaskNum: number;
  runningTaskNum: number;
  failedTaskNum: number;
};

const EMPTY_SUMMARY: QueueSummaryData = {
  totalTaskNum: 0,
  finishedTaskNum: 0,
  finishedNeedReadTaskNum: 0,
  runningTaskNum: 0,
  failedTaskNum: 0,
};

const RUNNING_WORKFLOW_STATUSES = ["queued", "running"];
const FAILED_WORKFLOW_STATUSES = ["failed", "cancelled", "canceled"];
const RUNNING_TASK_STALE_MS = getRunningTaskStaleMs();

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const summaryOnly = searchParams.get("summary") === "1" || searchParams.get("mode") === "summary";
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return queueJson(summaryOnly ? summaryPayload(EMPTY_SUMMARY) : detailPayload([], EMPTY_SUMMARY));

    const summary = await loadQueueSummary(supabase, user.id);
    if (summaryOnly) return queueJson(summaryPayload(summary));

    const { data, error } = await supabase
      .from("generations")
      .select(QUEUE_COLUMNS)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(24);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rawRows = (Array.isArray(data) ? data : []) as unknown as QueueRow[];
    const generationRows = rawRows.map(normalizeQueueRow);
    const workflowRows = await loadWorkflowRows(supabase, user.id);
    const rows = [...generationRows, ...workflowRows]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 32);

    return queueJson(detailPayload(rows, summary));
  } catch (error) {
    if (process.env.NODE_ENV === "development") console.error("[task-queue] error:", error);
    return NextResponse.json({ error: "任务队列加载失败" }, { status: 500 });
  }
}

async function loadQueueSummary(supabase: Awaited<ReturnType<typeof createServerSupabase>>, userId: string): Promise<QueueSummaryData> {
  const [
    generationTotal,
    generationFailed,
    workflowTotal,
    workflowFailed,
  ] = await Promise.all([
    countRows(
      supabase
        .from("generations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      "generations total"
    ),
    countRows(
      supabase
        .from("generations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("status", [...GENERATION_FAILED_STATUS_FILTERS]),
      "generations failed"
    ),
    countRows(
      supabase
        .from("agent_workflows")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId),
      "workflows total",
      true
    ),
    countRows(
      supabase
        .from("agent_workflows")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("status", FAILED_WORKFLOW_STATUSES),
      "workflows failed",
      true
    ),
  ]);
  const [generationRunning, workflowRunning] = await Promise.all([
    loadRunningGenerationCount(supabase, userId),
    loadRunningWorkflowCount(supabase, userId),
  ]);

  const totalTaskNum = generationTotal + workflowTotal;
  const runningTaskNum = generationRunning + workflowRunning;
  const failedTaskNum = generationFailed + workflowFailed;
  const finishedTaskNum = Math.max(0, totalTaskNum - runningTaskNum - failedTaskNum);

  return {
    totalTaskNum,
    finishedTaskNum,
    finishedNeedReadTaskNum: 0,
    runningTaskNum,
    failedTaskNum,
  };
}

async function loadRunningGenerationCount(supabase: Awaited<ReturnType<typeof createServerSupabase>>, userId: string) {
  const { data, error } = await supabase
    .from("generations")
    .select(SUMMARY_GENERATION_COLUMNS)
    .eq("user_id", userId)
    .in("status", [...GENERATION_RUNNING_STATUS_FILTERS]);

  if (error) throw new Error(`generations running: ${error.message || "query failed"}`);

  const rows = (Array.isArray(data) ? data : []) as unknown as QueueRow[];
  return rows.filter((row) => {
    const state = normalizeGenerationState({
      status: row.status,
      resultUrls: row.result_urls,
      payload: row.job_payload,
      completedAt: row.completed_at,
    });
    return state.statusGroup === "running" && !isStaleRunningGeneration(row);
  }).length;
}

async function loadRunningWorkflowCount(supabase: Awaited<ReturnType<typeof createServerSupabase>>, userId: string) {
  const { data, error } = await supabase
    .from("agent_workflows")
    .select(SUMMARY_WORKFLOW_COLUMNS)
    .eq("user_id", userId)
    .in("status", RUNNING_WORKFLOW_STATUSES);

  if (error) {
    if (process.env.NODE_ENV === "development") console.warn("[task-queue] workflows running unavailable:", error.message);
    return 0;
  }

  const rows = (Array.isArray(data) ? data : []) as unknown as Pick<WorkflowRow, "status" | "created_at" | "updated_at">[];
  return rows.filter((row) => isRunningWorkflowStatus(row.status) && !isStaleRunningDate(row.updated_at || row.created_at)).length;
}

async function countRows(
  query: PromiseLike<{ count: number | null; error: { message?: string } | null }>,
  label: string,
  optional = false
) {
  const { count, error } = await query;
  if (error) {
    if (optional) {
      if (process.env.NODE_ENV === "development") console.warn(`[task-queue] ${label} unavailable:`, error.message);
      return 0;
    }
    throw new Error(`${label}: ${error.message || "count failed"}`);
  }
  return count || 0;
}

function summaryPayload(summary: QueueSummaryData) {
  return {
    data: summary,
    totalCount: summary.totalTaskNum,
    runningCount: summary.runningTaskNum,
    finishedCount: summary.finishedTaskNum + summary.failedTaskNum,
    failedCount: summary.failedTaskNum,
  };
}

function detailPayload(rows: QueueItem[], summary: QueueSummaryData) {
  return {
    ...summaryPayload(summary),
    rows,
  };
}

function queueJson(body: unknown) {
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

async function loadWorkflowRows(supabase: Awaited<ReturnType<typeof createServerSupabase>>, userId: string) {
  const { data, error } = await supabase
    .from("agent_workflows")
    .select("id,status,intent,summary,input_images,final_outputs,cost_reserved,cost_settled,error_message,created_at,updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(16);

  if (error) {
    if (process.env.NODE_ENV === "development") console.warn("[task-queue] agent workflows unavailable:", error.message);
    return [];
  }

  const workflows = (Array.isArray(data) ? data : []) as unknown as WorkflowRow[];
  return workflows.map(normalizeWorkflowRow);
}

function normalizeQueueRow(row: QueueRow): QueueItem {
  const payload = row.job_payload && typeof row.job_payload === "object" ? row.job_payload : {};
  const kind = typeof payload.kind === "string" ? payload.kind : "";
  const state = normalizeGenerationState({
    status: row.status,
    resultUrls: row.result_urls,
    payload,
    completedAt: row.completed_at,
  });
  const completedAt = state.completedAt || row.completed_at;
  const statusGroup = state.statusGroup === "running" && isStaleRunningGeneration(row)
    ? "finished"
    : state.statusGroup;
  return {
    id: row.id,
    title: moduleLabel(kind),
    status: state.status,
    statusGroup,
    progress: state.progress,
    time: formatDuration(row.created_at, statusGroup === "finished" ? completedAt || row.created_at : null),
    createdAt: row.created_at,
    completedAt,
    error: row.error_message || "",
    thumbnails: getThumbnails(row, payload),
  };
}

function normalizeWorkflowRow(row: WorkflowRow): QueueItem {
  const statusGroup = isRunningWorkflowStatus(row.status) && !isStaleRunningDate(row.updated_at || row.created_at)
    ? "running" as const
    : "finished" as const;
  return {
    id: row.id,
    title: row.summary || workflowLabel(row.intent || ""),
    status: row.status,
    statusGroup,
    time: formatDuration(row.created_at, statusGroup === "finished" ? row.updated_at : null),
    createdAt: row.created_at,
    completedAt: row.updated_at,
    error: row.error_message || "",
    thumbnails: getWorkflowThumbnails(row),
  };
}

function isRunningWorkflowStatus(status: string) {
  return status === "queued" || status === "running";
}

function isStaleRunningGeneration(row: Pick<QueueRow, "created_at" | "processing_started_at" | "job_payload">) {
  return isStaleRunningDate(row.processing_started_at || readAsyncTaskUpdatedAt(row.job_payload) || row.created_at);
}

function isStaleRunningDate(value?: string | null) {
  const time = value ? Date.parse(value) : NaN;
  if (!Number.isFinite(time)) return true;
  return Date.now() - time > RUNNING_TASK_STALE_MS;
}

function readAsyncTaskUpdatedAt(payload: QueueRow["job_payload"]) {
  const asyncTask = payload && typeof payload === "object" && "asyncTask" in payload
    ? payload.asyncTask
    : null;
  if (!asyncTask || typeof asyncTask !== "object" || !("updatedAt" in asyncTask)) return null;
  return typeof asyncTask.updatedAt === "string" ? asyncTask.updatedAt : null;
}

function getRunningTaskStaleMs() {
  const value = Number(process.env.TASK_QUEUE_RUNNING_STALE_MS || process.env.IMAGE_TASK_TIMEOUT_MS || 10 * 60 * 1000);
  return Number.isFinite(value) ? Math.min(Math.max(value, 5 * 60 * 1000), 2 * 60 * 60 * 1000) : 10 * 60 * 1000;
}

function moduleLabel(kind: string) {
  if (kind === "tryon") return "Virtual Try-on";
  if (kind === "faceSwap") return "Swap Face";
  if (kind === "model") return "AI Model";
  if (kind === "pose") return "Pose Variation";
  if (kind === "grass") return "AI Lookbook";
  if (kind === "modelBackground") return "Change Background";
  if (kind === "garment3d") return "Flat Lay Generator";
  return "AI Task";
}

function workflowLabel(intent: string) {
  if (intent.includes("tryon")) return "Agent Try-on";
  if (intent.includes("pose")) return "Agent Pose";
  if (intent.includes("detail")) return "Agent Detail Page";
  if (intent.includes("face")) return "Agent Face Swap";
  return "Agent Workflow";
}

function getThumbnails(row: QueueRow, payload: Record<string, unknown>) {
  const urls = [
    ...(Array.isArray(row.result_urls) ? row.result_urls : []),
    ...stringArray(payload.clothingUrls),
    stringValue(payload.sourceUrl),
    stringValue(payload.faceUrl),
    stringValue(payload.mainImageUrl),
    stringValue(payload.garmentUrl),
    stringValue(payload.referenceUrl),
    stringValue(row.model_face_url),
    stringValue(row.reference_url),
    ...(Array.isArray(row.clothing_urls) ? row.clothing_urls : []),
  ].filter(Boolean) as string[];
  return Array.from(new Set(urls)).slice(0, 2);
}

function getWorkflowThumbnails(row: WorkflowRow) {
  const inputUrls = Array.isArray(row.input_images)
    ? row.input_images
        .map((image) => image && typeof image === "object" && "url" in image ? (image as { url?: unknown }).url : "")
        .filter((url): url is string => typeof url === "string" && url.length > 0)
    : [];
  const final = row.final_outputs && typeof row.final_outputs === "object" ? row.final_outputs : {};
  const outputUrls = [
    ...stringArray(final.imageUrls),
    stringValue(final.selectedImageUrl),
  ];
  return Array.from(new Set([...outputUrls, ...inputUrls])).slice(0, 2);
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : "";
}

function formatDuration(start: string, end?: string | null) {
  const startMs = Date.parse(start);
  const endMs = end ? Date.parse(end) : Date.now();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return "";
  const seconds = Math.max(0, Math.round((endMs - startMs) / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes ? `${minutes}:${String(rest).padStart(2, "0")}` : `0:${String(rest).padStart(2, "0")}`;
}
