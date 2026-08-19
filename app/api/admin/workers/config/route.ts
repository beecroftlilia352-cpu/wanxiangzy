import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  WORKER_RUNTIME_CONFIG_KEY,
  parseWorkerRuntimeConfig,
  validateWorkerRuntimeConfig,
} from "@/lib/queue/worker-runtime-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi("workers:read");
  if (!auth.ok) return auth.response;
  const { data, error } = await getAdminClient()
    .from("admin_config_versions")
    .select("id,value,status,published_at,created_at,created_by")
    .eq("config_key", WORKER_RUNTIME_CONFIG_KEY)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    config: parseWorkerRuntimeConfig(data?.value),
    version: data ? { id: data.id, status: data.status, publishedAt: data.published_at, createdAt: data.created_at } : null,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi("workers:write");
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => ({})) as { config?: unknown; reason?: unknown };
  const validation = validateWorkerRuntimeConfig(body.config);
  if (validation.error || !validation.config) {
    return NextResponse.json({ error: validation.error || "Worker 配置无效" }, { status: 400 });
  }
  const admin = getAdminClient();
  const { data, error } = await admin.rpc("publish_worker_runtime_config", {
    p_value: validation.config,
    p_created_by: auth.context.userId,
  });
  if (error) return NextResponse.json({ error: `保存失败：${error.message}` }, { status: 400 });
  const row = Array.isArray(data) ? data[0] : data;
  await writeAdminAuditLog(auth.context, {
    action: "worker.runtime_config.publish",
    resourceType: "admin_config_version",
    resourceId: String(row?.id || WORKER_RUNTIME_CONFIG_KEY),
    reason: typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 500) : "更新 Worker 运行策略",
    metadata: validation.config,
  });
  return NextResponse.json({ ok: true, config: validation.config, version: row || null }, { headers: { "Cache-Control": "no-store" } });
}
