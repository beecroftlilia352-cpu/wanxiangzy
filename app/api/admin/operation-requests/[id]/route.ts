import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { getAdminClient } from "@/lib/supabase/admin";

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, { params }: RouteProps) {
  const auth = await requireAdminApi("operation_requests:approve");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await request.json().catch(() => ({})) as {
    action?: unknown;
    reason?: unknown;
  };
  const action = body.action === "approve" || body.action === "reject" ? body.action : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (!isUuid(id)) {
    return NextResponse.json({ error: "审批单 ID 不合法" }, { status: 400 });
  }
  if (!action) {
    return NextResponse.json({ error: "action 必须是 approve 或 reject" }, { status: 400 });
  }
  if (reason.length < 4 || reason.length > 240) {
    return NextResponse.json({ error: "reason 需要 4-240 个字符" }, { status: 400 });
  }

  const admin = getAdminClient();
  const { data: requestRow, error: loadError } = await admin
    .from("admin_operation_requests")
    .select("id,request_type,status,target_type,target_id,reason,risk_level,payload")
    .eq("id", id)
    .single();

  if (loadError || !requestRow) {
    return NextResponse.json({ error: loadError?.message || "审批单不存在" }, { status: 404 });
  }
  if (requestRow.status !== "pending") {
    return NextResponse.json({ error: "审批单已处理，不能重复操作" }, { status: 409 });
  }

  if (action === "reject") {
    const { data, error } = await admin
      .from("admin_operation_requests")
      .update({
        status: "rejected",
        approved_by: auth.context.userId,
        approved_by_email: auth.context.email,
        approved_by_role: auth.context.role,
        approved_at: new Date().toISOString(),
        result: { rejectedReason: reason },
      })
      .eq("id", id)
      .select("id,status,result,updated_at,approved_at")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    await writeAdminAuditLog(auth.context, {
      action: "operation_request.reject",
      resourceType: "admin_operation_request",
      resourceId: id,
      reason,
      metadata: { requestType: requestRow.request_type, targetId: requestRow.target_id },
    });
    return NextResponse.json({ ok: true, request: data }, { headers: { "Cache-Control": "no-store" } });
  }

  if (requestRow.request_type !== "credits.adjust") {
    return NextResponse.json({ error: "不支持的审批单类型" }, { status: 400 });
  }

  const payload = isRecord(requestRow.payload) ? requestRow.payload : {};
  const userId = typeof payload.userId === "string" ? payload.userId : requestRow.target_id;
  const amount = Number(payload.amount);
  if (!isUuid(userId) || !Number.isInteger(amount) || amount === 0) {
    return NextResponse.json({ error: "审批单 payload 不完整，无法执行积分调整" }, { status: 400 });
  }

  const rpc = await admin.rpc("admin_adjust_user_credits", {
    p_user_id: userId,
    p_amount: amount,
    p_reason: `${requestRow.reason}；审批：${reason}`,
    p_actor_user_id: auth.context.userId,
    p_actor_email: auth.context.email,
    p_actor_role: auth.context.role,
  });
  if (rpc.error) {
    await markFailed(id, rpc.error.message, auth.context);
    return NextResponse.json({ error: rpc.error.message }, { status: 400 });
  }

  const { data, error } = await admin
    .from("admin_operation_requests")
    .update({
      status: "approved",
      approved_by: auth.context.userId,
      approved_by_email: auth.context.email,
      approved_by_role: auth.context.role,
      approved_at: new Date().toISOString(),
      result: { creditsAdjustment: rpc.data, approvalReason: reason },
    })
    .eq("id", id)
    .select("id,status,result,updated_at,approved_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAdminAuditLog(auth.context, {
    action: "operation_request.approve",
    resourceType: "admin_operation_request",
    resourceId: id,
    reason,
    metadata: { requestType: requestRow.request_type, userId, amount, rpcResult: rpc.data },
  });

  return NextResponse.json({ ok: true, request: data }, { headers: { "Cache-Control": "no-store" } });
}

async function markFailed(id: string, error: string, context: { userId: string; email: string | null; role: string }) {
  await getAdminClient()
    .from("admin_operation_requests")
    .update({
      status: "failed",
      approved_by: context.userId,
      approved_by_email: context.email,
      approved_by_role: context.role,
      approved_at: new Date().toISOString(),
      result: { error },
    })
    .eq("id", id);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
