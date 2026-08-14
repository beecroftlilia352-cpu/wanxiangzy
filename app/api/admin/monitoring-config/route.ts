import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { getAdminClient } from "@/lib/supabase/admin";
import { isRecord } from "@/lib/utils";
import { clearSiteMonitoringConfigCache } from "@/lib/site-config";

const CONFIG_KEY = "site.monitoring";

/** 读取监控与 SEO 配置（后台用） */
export async function GET(_request: NextRequest) {
  const auth = await requireAdminApi("settings:read");
  if (!auth.ok) return auth.response;

  const { data } = await getAdminClient()
    .from("admin_config_versions")
    .select("value,published_at,created_by")
    .eq("config_key", CONFIG_KEY)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    config: isRecord(data?.value) ? data.value : null,
    publishedAt: data?.published_at ?? null,
    createdBy: data?.created_by ?? null,
  });
}

/** 保存并发布监控与 SEO 配置 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminApi("settings:write");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const sentryDsn = typeof body.sentryDsn === "string" ? body.sentryDsn.trim() : "";
  const seoTitle = typeof body.seoTitle === "string" ? body.seoTitle.trim().slice(0, 80) : "";
  const seoDescription = typeof body.seoDescription === "string" ? body.seoDescription.trim().slice(0, 200) : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (!sentryDsn && !seoTitle && !seoDescription) {
    return NextResponse.json({ error: "请至少填写一项配置" }, { status: 400 });
  }

  const value = {
    sentryDsn,
    seoTitle,
    seoDescription,
    updatedAt: new Date().toISOString(),
  };

  const { error } = await getAdminClient()
    .from("admin_config_versions")
    .insert({
      config_key: CONFIG_KEY,
      status: "published",
      value,
      created_by: auth.context.email || auth.context.userId,
      published_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });

  if (error) {
    return NextResponse.json({ error: `保存失败：${error.message}` }, { status: 500 });
  }

  clearSiteMonitoringConfigCache();
  await writeAdminAuditLog(auth.context, {
    action: "monitoring_config.update",
    resourceType: "config",
    resourceId: CONFIG_KEY,
    reason: reason || "更新监控与 SEO 配置",
  });

  return NextResponse.json({ ok: true });
}
