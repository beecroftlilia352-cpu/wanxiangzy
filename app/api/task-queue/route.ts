import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { normalizeGenerationState } from "@/lib/api/generation-state";

const QUEUE_COLUMNS = [
  "id",
  "status",
  "error_message",
  "result_urls",
  "created_at",
  "completed_at",
  "job_payload",
  "clothing_urls",
  "model_face_url",
  "reference_url",
].join(",");

type QueueRow = {
  id: string;
  status: string;
  error_message?: string | null;
  result_urls?: string[] | null;
  created_at: string;
  completed_at?: string | null;
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

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ rows: [], runningCount: 0, finishedCount: 0 });

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

    return NextResponse.json({
      rows,
      runningCount: rows.filter((row) => row.statusGroup === "running").length,
      finishedCount: rows.filter((row) => row.statusGroup === "finished").length,
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") console.error("[task-queue] error:", error);
    return NextResponse.json({ error: "任务队列加载失败" }, { status: 500 });
  }
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

function normalizeQueueRow(row: QueueRow) {
  const payload = row.job_payload && typeof row.job_payload === "object" ? row.job_payload : {};
  const kind = typeof payload.kind === "string" ? payload.kind : "";
  const state = normalizeGenerationState({
    status: row.status,
    resultUrls: row.result_urls,
    payload,
    completedAt: row.completed_at,
  });
  const completedAt = state.completedAt || row.completed_at;
  return {
    id: row.id,
    title: moduleLabel(kind),
    status: state.status,
    statusGroup: state.statusGroup,
    progress: state.progress,
    time: formatDuration(row.created_at, state.statusGroup === "finished" ? completedAt || row.created_at : null),
    createdAt: row.created_at,
    completedAt,
    error: row.error_message || "",
    thumbnails: getThumbnails(row, payload),
  };
}

function normalizeWorkflowRow(row: WorkflowRow) {
  const statusGroup = isRunningWorkflowStatus(row.status) ? "running" as const : "finished" as const;
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
