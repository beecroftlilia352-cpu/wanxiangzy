import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { getStudioShowcaseRegistry } from "@/lib/showcase-examples.server";
import {
  SHOWCASE_CONFIG_KEY,
  archiveShowcaseExample,
  upsertShowcaseExample,
} from "@/lib/showcase-examples";
import { getAdminClient } from "@/lib/supabase/admin";

type MutationBody = {
  action?: unknown;
  example?: unknown;
  id?: unknown;
  reason?: unknown;
  enabled?: unknown;
};

export async function GET() {
  const auth = await requireAdminApi("assets:read");
  if (!auth.ok) return auth.response;
  return NextResponse.json(await getStudioShowcaseRegistry(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi("assets:write");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({})) as MutationBody;
  const action = body.action === "archive" ? "archive" : body.action === "toggle" ? "toggle" : "upsert";
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 240) : "";
  if (reason.length < 4) {
    return NextResponse.json({ error: "请填写至少 4 个字的操作原因" }, { status: 400 });
  }

  const registry = await getStudioShowcaseRegistry();
  let nextItems = registry.items;
  let enabled = registry.enabled;
  let resourceId = "registry";
  try {
    if (action === "archive") {
      resourceId = typeof body.id === "string" ? body.id.trim() : "";
      nextItems = archiveShowcaseExample(nextItems, resourceId);
    } else if (action === "toggle") {
      enabled = typeof body.enabled === "boolean" ? body.enabled : !enabled;
    } else {
      nextItems = upsertShowcaseExample(nextItems, body.example);
      resourceId = typeof body.example === "object" && body.example
        ? String((body.example as Record<string, unknown>).id || "")
        : "";
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "示例配置处理失败" }, { status: 400 });
  }

  const admin = getAdminClient();
  await admin
    .from("admin_config_versions")
    .update({ status: "archived" })
    .eq("config_key", SHOWCASE_CONFIG_KEY)
    .eq("status", "published");

  const { data, error } = await admin
    .from("admin_config_versions")
    .insert({
      config_key: SHOWCASE_CONFIG_KEY,
      value: { version: 1, module: registry.module, enabled, items: nextItems },
      status: "published",
      created_by: auth.context.userId,
      published_at: new Date().toISOString(),
    })
    .select("id,config_key,status,value,created_by,published_at,created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAdminAuditLog(auth.context, {
    action: `showcase_example.${action}`,
    resourceType: "studio_showcase_example",
    resourceId,
    reason,
    metadata: { configKey: SHOWCASE_CONFIG_KEY, versionId: data?.id, enabled },
  });

  return NextResponse.json({
    ok: true,
    config: data,
    registry: {
      ...registry,
      enabled,
      activeVersionId: String(data?.id || ""),
      activeVersionStatus: "published",
      items: nextItems,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
