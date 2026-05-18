import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { getAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const auth = await requireAdminApi("settings:write");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({})) as {
    configKey?: unknown;
    status?: unknown;
    value?: unknown;
  };
  const configKey = typeof body.configKey === "string" ? body.configKey.trim() : "";
  const status = body.status === "published" ? "published" : "draft";
  const value = isRecord(body.value) ? body.value : null;

  if (!/^[a-z][a-z0-9_.-]{2,80}$/i.test(configKey)) {
    return NextResponse.json({ error: "configKey 需要 3-80 位，仅支持字母、数字、点、下划线和中划线" }, { status: 400 });
  }
  if (!value) {
    return NextResponse.json({ error: "value 必须是 JSON object" }, { status: 400 });
  }

  const admin = getAdminClient();
  if (status === "published") {
    await admin
      .from("admin_config_versions")
      .update({ status: "archived" })
      .eq("config_key", configKey)
      .eq("status", "published");
  }

  const { data, error } = await admin
    .from("admin_config_versions")
    .insert({
      config_key: configKey,
      value,
      status,
      created_by: auth.context.userId,
      published_at: status === "published" ? new Date().toISOString() : null,
    })
    .select("id,config_key,status,value,created_by,published_at,created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await writeAdminAuditLog(auth.context, {
    action: "config_version.create",
    resourceType: "admin_config_version",
    resourceId: String(data?.id || ""),
    reason: `Create ${configKey} as ${status}`,
    metadata: { configKey, status },
  });

  return NextResponse.json({ ok: true, config: data }, { headers: { "Cache-Control": "no-store" } });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
