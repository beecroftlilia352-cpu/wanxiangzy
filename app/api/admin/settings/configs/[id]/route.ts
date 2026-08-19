import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { getAdminClient } from "@/lib/supabase/admin";

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, { params }: RouteProps) {
  const auth = await requireAdminApi("settings:write");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await request.json().catch(() => ({})) as {
    action?: unknown;
    reason?: unknown;
  };
  const action = body.action === "publish" || body.action === "archive" ? body.action : null;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (!isUuid(id)) {
    return NextResponse.json({ error: "配置版本 ID 不合法" }, { status: 400 });
  }
  if (!action) {
    return NextResponse.json({ error: "action 必须是 publish 或 archive" }, { status: 400 });
  }
  if (reason.length < 6) {
    return NextResponse.json({ error: "请填写至少 6 个字符的操作原因" }, { status: 400 });
  }

  const admin = getAdminClient();
  const { data: current, error: loadError } = await admin
    .from("admin_config_versions")
    .select("id,config_key,status,value")
    .eq("id", id)
    .single();

  if (loadError || !current) {
    return NextResponse.json({ error: loadError?.message || "配置版本不存在" }, { status: 404 });
  }
  if (current.config_key === "model.routing") {
    return NextResponse.json({ error: "model.routing 已废弃，只能查看历史记录，不能再次发布或归档" }, { status: 409 });
  }

  if (action === "publish") {
    await admin
      .from("admin_config_versions")
      .update({ status: "archived" })
      .eq("config_key", current.config_key)
      .eq("status", "published")
      .neq("id", id);
  }

  const patch = action === "publish"
    ? { status: "published", published_at: new Date().toISOString() }
    : { status: "archived" };

  const { data, error } = await admin
    .from("admin_config_versions")
    .update(patch)
    .eq("id", id)
    .select("id,config_key,status,value,created_by,published_at,created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await writeAdminAuditLog(auth.context, {
    action: `config_version.${action}`,
    resourceType: "admin_config_version",
    resourceId: id,
    reason,
    metadata: {
      configKey: current.config_key,
      previousStatus: current.status,
      nextStatus: data?.status,
      valuePreview: current.value,
    },
  });

  return NextResponse.json({ ok: true, config: data }, { headers: { "Cache-Control": "no-store" } });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
