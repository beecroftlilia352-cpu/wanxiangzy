import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { listAdminOperationRequests } from "@/lib/admin/data";
import { getAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const auth = await requireAdminApi("operation_requests:read");
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  const result = await listAdminOperationRequests({
    q: params.get("q") || "",
    status: params.get("status") || "",
    limit: Number(params.get("limit") || 60),
  });

  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi("operation_requests:write");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({})) as {
    requestType?: unknown;
    userId?: unknown;
    amount?: unknown;
    reason?: unknown;
    generationId?: unknown;
  };
  const requestType = body.requestType === "credits.adjust" ? "credits.adjust" : "";
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const amount = Number(body.amount);
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const generationId = typeof body.generationId === "string" ? body.generationId.trim() : "";

  if (requestType !== "credits.adjust") {
    return NextResponse.json({ error: "当前仅支持 credits.adjust 审批单" }, { status: 400 });
  }
  if (!isUuid(userId)) {
    return NextResponse.json({ error: "userId 必须是有效 UUID" }, { status: 400 });
  }
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 10000) {
    return NextResponse.json({ error: "amount 必须是 -10000 到 10000 之间的非零整数" }, { status: 400 });
  }
  if (reason.length < 4 || reason.length > 240) {
    return NextResponse.json({ error: "reason 需要 4-240 个字符" }, { status: 400 });
  }
  if (generationId && !isUuid(generationId)) {
    return NextResponse.json({ error: "generationId 必须是有效 UUID" }, { status: 400 });
  }

  const riskLevel = Math.abs(amount) >= 100 ? "high" : Math.abs(amount) >= 20 ? "medium" : "low";
  const { data, error } = await getAdminClient()
    .from("admin_operation_requests")
    .insert({
      request_type: requestType,
      status: "pending",
      requested_by: auth.context.userId,
      requested_by_email: auth.context.email,
      requested_by_role: auth.context.role,
      target_type: "profile",
      target_id: userId,
      reason,
      risk_level: riskLevel,
      payload: { userId, amount, generationId: generationId || null },
    })
    .select("id,request_type,status,target_type,target_id,reason,risk_level,payload,created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await writeAdminAuditLog(auth.context, {
    action: "operation_request.create",
    resourceType: "admin_operation_request",
    resourceId: String(data?.id || ""),
    reason,
    metadata: { requestType, userId, amount, generationId: generationId || null, riskLevel },
  });

  return NextResponse.json({ ok: true, request: data }, { headers: { "Cache-Control": "no-store" } });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
