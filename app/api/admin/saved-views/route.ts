import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { listAdminSavedViews } from "@/lib/admin/data";
import { getAdminClient } from "@/lib/supabase/admin";

const RESOURCES = new Set(["users", "credits", "generations", "assets", "audit", "reports", "requests", "moderation", "workers"]);

export async function GET(request: Request) {
  const auth = await requireAdminApi("saved_views:read");
  if (!auth.ok) return auth.response;

  const resource = new URL(request.url).searchParams.get("resource") || "";
  return NextResponse.json(await listAdminSavedViews({ resource, limit: 100 }), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi("saved_views:write");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({})) as {
    name?: unknown;
    resource?: unknown;
    visibility?: unknown;
    filters?: unknown;
    columns?: unknown;
    sort?: unknown;
  };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const resource = typeof body.resource === "string" ? body.resource.trim() : "";
  const visibility = body.visibility === "team" ? "team" : "private";
  const filters = isRecord(body.filters) ? body.filters : {};
  const columns = Array.isArray(body.columns) ? body.columns : [];
  const sort = isRecord(body.sort) ? body.sort : {};

  if (name.length < 2 || name.length > 60) {
    return NextResponse.json({ error: "视图名称需要 2-60 个字符" }, { status: 400 });
  }
  if (!RESOURCES.has(resource)) {
    return NextResponse.json({ error: "resource 不合法" }, { status: 400 });
  }

  const { data, error } = await getAdminClient()
    .from("admin_saved_views")
    .insert({
      owner_user_id: auth.context.userId,
      owner_email: auth.context.email,
      name,
      resource,
      visibility,
      filters,
      columns,
      sort,
    })
    .select("id,owner_user_id,owner_email,name,resource,visibility,filters,columns,sort,created_at,updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await writeAdminAuditLog(auth.context, {
    action: "saved_view.create",
    resourceType: "admin_saved_view",
    resourceId: String(data?.id || ""),
    reason: `save ${resource} view`,
    metadata: { name, resource, visibility, filters, columns, sort },
  });

  return NextResponse.json({ ok: true, view: data }, { headers: { "Cache-Control": "no-store" } });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
