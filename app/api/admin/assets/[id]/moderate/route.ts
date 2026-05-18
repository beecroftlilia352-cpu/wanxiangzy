import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { getAdminClient } from "@/lib/supabase/admin";

type RouteProps = {
  params: Promise<{ id: string }>;
};

const SOURCE_TYPES = new Set(["generation", "reference", "favorite-plan"]);
const ACTIONS = new Set(["hide", "pass", "escalate"]);

export async function POST(request: Request, { params }: RouteProps) {
  const auth = await requireAdminApi("moderation:write");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await request.json().catch(() => ({})) as {
    sourceType?: unknown;
    action?: unknown;
    reason?: unknown;
  };
  const sourceType = typeof body.sourceType === "string" ? body.sourceType.trim() : "";
  const action = typeof body.action === "string" ? body.action.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (!id || id.length > 160) {
    return NextResponse.json({ error: "资产 ID 不合法" }, { status: 400 });
  }
  if (!SOURCE_TYPES.has(sourceType)) {
    return NextResponse.json({ error: "sourceType 不合法" }, { status: 400 });
  }
  if (!ACTIONS.has(action)) {
    return NextResponse.json({ error: "action 必须是 hide、pass 或 escalate" }, { status: 400 });
  }
  if (reason.length < 4) {
    return NextResponse.json({ error: "请填写至少 4 个字符的审核原因" }, { status: 400 });
  }

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("moderation_cases")
    .insert({
      source_type: sourceType,
      source_id: id,
      action,
      status: action === "pass" ? "resolved" : "open",
      reason,
      metadata: { adminAction: action },
      created_by: auth.context.userId,
      resolved_at: action === "pass" ? new Date().toISOString() : null,
    })
    .select("id,source_type,source_id,action,status,reason,metadata,created_by,created_at,resolved_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (sourceType === "generation") {
    await markGenerationModeration(id, action, reason, auth.context.userId);
  }

  await writeAdminAuditLog(auth.context, {
    action: `asset.moderation.${action}`,
    resourceType: sourceType,
    resourceId: id,
    reason,
    metadata: { moderationCaseId: data?.id, sourceType, action },
  });

  return NextResponse.json({ ok: true, case: data }, { headers: { "Cache-Control": "no-store" } });
}

async function markGenerationModeration(id: string, action: string, reason: string, actorUserId: string) {
  const admin = getAdminClient();
  const { data } = await admin
    .from("generations")
    .select("job_payload,result_urls")
    .eq("id", id)
    .maybeSingle();
  const payload = isRecord(data?.job_payload) ? data.job_payload : {};
  await admin
    .from("generations")
    .update({
      job_payload: {
        ...payload,
        adminModeration: {
          action,
          reason,
          actorUserId,
          updatedAt: new Date().toISOString(),
        },
      },
    })
    .eq("id", id);

  if (action === "hide") {
    await admin
      .from("task_queue_items")
      .update({
        result_thumbnails: [],
        result_count: 0,
        error_message: "内容已由后台审核下架",
      })
      .eq("source_type", "generation")
      .eq("source_id", id);
  } else {
    await admin
      .from("task_queue_items")
      .update({
        result_thumbnails: Array.isArray(data?.result_urls) ? data.result_urls.slice(0, 4) : [],
        result_count: Array.isArray(data?.result_urls) ? data.result_urls.length : 0,
        error_message: null,
      })
      .eq("source_type", "generation")
      .eq("source_id", id);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
