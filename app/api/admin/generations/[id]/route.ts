import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { getAdminTaskDetail } from "@/lib/admin/data";
import { getAdminClient } from "@/lib/supabase/admin";
import { syncGenerationTaskQueueById, syncWorkflowTaskQueueById } from "@/lib/task-queue-store";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireAdminApi("tasks:read");
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "无效任务 ID" }, { status: 400 });
  }

  const detail = await getAdminTaskDetail(id);
  if (!detail.task && !detail.queueItem) {
    return NextResponse.json({ error: "任务不存在", detail }, { status: 404 });
  }

  return NextResponse.json(detail, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireAdminApi("tasks:operate");
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "无效任务 ID" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({})) as {
    action?: unknown;
    sourceType?: unknown;
    reason?: unknown;
  };
  const action = normalizeTaskAction(body.action);
  const sourceType = body.sourceType === "workflow" ? "workflow" : body.sourceType === "generation" ? "generation" : "";
  const reason = typeof body.reason === "string" && body.reason.trim()
    ? body.reason.trim()
    : defaultReason(action);

  if (!action) return NextResponse.json({ error: "不支持的任务操作" }, { status: 400 });
  if (reason.length < 4 || reason.length > 240) {
    return NextResponse.json({ error: "操作原因需要 4-240 个字符" }, { status: 400 });
  }

  const result = sourceType === "workflow"
    ? await operateWorkflowTask(id, action, reason)
    : sourceType === "generation"
      ? await operateGenerationTask(id, action, reason)
      : await operateAnyTask(id, action, reason);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  await writeAdminAuditLog(auth.context, {
    action: `task.${action}`,
    resourceType: result.sourceType,
    resourceId: id,
    reason,
    metadata: result.metadata,
  });

  return NextResponse.json(
    { ok: true, sourceType: result.sourceType, action, metadata: result.metadata },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

type TaskAction = "retry" | "mark_failed_refund" | "mark_failed_no_refund" | "cancel_refund";

type TaskOperationResult =
  | { ok: true; sourceType: "generation" | "workflow"; metadata: Record<string, unknown> }
  | { ok: false; status: number; error: string };

type GenerationOperationRow = {
  id: string;
  user_id: string;
  status: string | null;
  credits_cost: number | null;
  credits_used: number | null;
  result_urls: string[] | null;
};

type WorkflowOperationRow = {
  id: string;
  user_id: string;
  status: string | null;
  cost_reserved: number | null;
  cost_settled: number | null;
};

async function operateAnyTask(id: string, action: TaskAction, reason: string): Promise<TaskOperationResult> {
  const generationResult = await operateGenerationTask(id, action, reason, true);
  if (generationResult.ok || generationResult.status !== 404) return generationResult;
  return operateWorkflowTask(id, action, reason);
}

async function operateGenerationTask(
  id: string,
  action: TaskAction,
  reason: string,
  missingAs404 = false,
): Promise<TaskOperationResult> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("generations")
    .select("id,user_id,status,credits_cost,credits_used,result_urls")
    .eq("id", id)
    .maybeSingle();

  if (error) return { ok: false, status: 400, error: error.message };
  if (!data) return { ok: false, status: missingAs404 ? 404 : 404, error: "任务不存在" };

  const row = data as GenerationOperationRow;
  const status = String(row.status || "").toLowerCase();
  if (action === "retry") {
    if (isCompletedStatus(status)) {
      return { ok: false, status: 409, error: "已完成任务不能直接重新入队" };
    }
    const update = await admin
      .from("generations")
      .update({
        status: "queued",
        error_message: null,
        processing_started_at: null,
        completed_at: null,
        job_attempts: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id,status")
      .maybeSingle();
    if (update.error) return { ok: false, status: 400, error: update.error.message };
    await syncGenerationTaskQueueById(id);
    return { ok: true, sourceType: "generation", metadata: { previousStatus: row.status, nextStatus: "queued" } };
  }

  if (action === "mark_failed_no_refund") {
    if (isCompletedStatus(status)) return { ok: false, status: 409, error: "已完成任务不能标记失败" };
    const update = await admin
      .from("generations")
      .update({
        status: "failed",
        error_message: reason,
        processing_started_at: null,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id,status")
      .maybeSingle();
    if (update.error) return { ok: false, status: 400, error: update.error.message };
    await syncGenerationTaskQueueById(id);
    return { ok: true, sourceType: "generation", metadata: { previousStatus: row.status, nextStatus: "failed", refunded: 0 } };
  }

  if (isCompletedStatus(status) || status === "failed") {
    return { ok: false, status: 409, error: "任务已结束，不能重复退款" };
  }

  const amount = Math.max(0, Math.floor(Number(row.credits_used ?? row.credits_cost ?? 0)));
  if (amount <= 0) {
    const update = await admin
      .from("generations")
      .update({
        status: "failed",
        error_message: reason,
        processing_started_at: null,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("id,status")
      .maybeSingle();
    if (update.error) return { ok: false, status: 400, error: update.error.message };
    await syncGenerationTaskQueueById(id);
    return { ok: true, sourceType: "generation", metadata: { previousStatus: row.status, nextStatus: "failed", refunded: 0 } };
  }

  const refund = await admin.rpc("fail_generation_with_credit_refund", {
    p_user_id: row.user_id,
    p_generation_id: id,
    p_amount: amount,
    p_reason: action === "cancel_refund" ? `管理员取消退款：${reason}` : `管理员失败退款：${reason}`,
    p_error_message: reason,
  });
  if (refund.error) {
    const message = `${refund.error.code || ""} ${refund.error.message || ""}`.toLowerCase();
    const statusCode = message.includes("fail_generation_with_credit_refund") || message.includes("could not find") ? 501 : 400;
    return { ok: false, status: statusCode, error: refund.error.message || "退款失败" };
  }
  await syncGenerationTaskQueueById(id);
  return {
    ok: true,
    sourceType: "generation",
    metadata: {
      previousStatus: row.status,
      nextStatus: "failed",
      operation: action,
      refundRequested: amount,
      balance: refund.data,
      resultCount: Array.isArray(row.result_urls) ? row.result_urls.length : 0,
    },
  };
}

async function operateWorkflowTask(id: string, action: TaskAction, reason: string): Promise<TaskOperationResult> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("agent_workflows")
    .select("id,user_id,status,cost_reserved,cost_settled")
    .eq("id", id)
    .maybeSingle();

  if (error) return { ok: false, status: 400, error: error.message };
  if (!data) return { ok: false, status: 404, error: "任务不存在" };

  const row = data as WorkflowOperationRow;
  const status = String(row.status || "").toLowerCase();
  if (action === "retry") {
    if (isCompletedStatus(status)) return { ok: false, status: 409, error: "已完成 workflow 不能重新入队" };
    const update = await admin
      .from("agent_workflows")
      .update({ status: "queued", error_message: null, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (update.error) return { ok: false, status: 400, error: update.error.message };
    await admin
      .from("agent_workflow_steps")
      .update({ status: "ready", error_message: null, started_at: null, completed_at: null, updated_at: new Date().toISOString() })
      .eq("workflow_id", id)
      .in("status", ["queued", "running", "failed"]);
    await appendWorkflowAdminEvent(id, "workflow_queued", `Admin retried workflow: ${reason}`, { reason });
    await syncWorkflowTaskQueueById(id);
    return { ok: true, sourceType: "workflow", metadata: { previousStatus: row.status, nextStatus: "queued" } };
  }

  if (isCompletedStatus(status) || status === "failed" || status === "cancelled") {
    return { ok: false, status: 409, error: "workflow 已结束，不能重复操作" };
  }

  const shouldRefund = action === "mark_failed_refund" || action === "cancel_refund";
  const releaseAmount = shouldRefund
    ? Math.max(0, Math.floor(Number(row.cost_reserved || 0) - Number(row.cost_settled || 0)))
    : 0;
  if (releaseAmount > 0) {
    const release = await admin.rpc("release_agent_workflow_credits", {
      p_user_id: row.user_id,
      p_workflow_id: id,
      p_amount: releaseAmount,
      p_reason: action === "cancel_refund" ? `Admin workflow cancel release (${id})` : `Admin workflow failed release (${id})`,
    });
    if (release.error) return { ok: false, status: 400, error: release.error.message || "释放 workflow 灵点失败" };
  }

  const nextStatus = action === "cancel_refund" ? "cancelled" : "failed";
  const update = await admin
    .from("agent_workflows")
    .update({ status: nextStatus, error_message: reason, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (update.error) return { ok: false, status: 400, error: update.error.message };
  await admin
    .from("agent_workflow_steps")
    .update({ status: nextStatus, error_message: reason, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("workflow_id", id)
    .in("status", ["pending", "ready", "queued", "running"]);
  await appendWorkflowAdminEvent(id, nextStatus === "cancelled" ? "workflow_cancelled" : "workflow_failed", reason, { releaseAmount });
  await syncWorkflowTaskQueueById(id);
  return { ok: true, sourceType: "workflow", metadata: { previousStatus: row.status, nextStatus, released: releaseAmount } };
}

async function appendWorkflowAdminEvent(workflowId: string, type: string, message: string, payload: Record<string, unknown>) {
  await getAdminClient()
    .from("agent_workflow_events")
    .insert({ workflow_id: workflowId, type, message, payload });
}

function normalizeTaskAction(value: unknown): TaskAction | "" {
  if (value === "retry" || value === "mark_failed_refund" || value === "mark_failed_no_refund" || value === "cancel_refund") {
    return value;
  }
  return "";
}

function defaultReason(action: TaskAction | "") {
  if (action === "retry") return "管理员重新入队";
  if (action === "cancel_refund") return "管理员取消卡住任务";
  if (action === "mark_failed_no_refund") return "管理员标记失败不退款";
  return "管理员标记失败并退款";
}

function isCompletedStatus(status: string) {
  return status === "completed" || status === "success" || status === "succeeded" || status === "partially_completed";
}
