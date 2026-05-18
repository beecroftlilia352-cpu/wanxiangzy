import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import {
  buildAdminExportCsv,
  loadAdminExportData,
  normalizeAdminExportFilters,
  normalizeAdminExportType,
} from "@/lib/admin/exports";
import { getAdminClient } from "@/lib/supabase/admin";

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: RouteProps) {
  const auth = await requireAdminApi("exports:read");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const token = new URL(request.url).searchParams.get("token") || "";
  if (!isUuid(id) || !token) {
    return NextResponse.json({ error: "下载链接不合法" }, { status: 400 });
  }

  const admin = getAdminClient();
  const { data: job, error } = await admin
    .from("admin_export_jobs")
    .select("id,export_type,status,filters,download_token,expires_at")
    .eq("id", id)
    .single();

  if (error || !job) {
    return NextResponse.json({ error: error?.message || "导出任务不存在" }, { status: 404 });
  }
  if (job.download_token !== token) {
    return NextResponse.json({ error: "下载令牌无效" }, { status: 403 });
  }
  if (job.status !== "ready") {
    return NextResponse.json({ error: "导出任务不可下载" }, { status: 409 });
  }
  if (Date.parse(job.expires_at || "") <= Date.now()) {
    await admin.from("admin_export_jobs").update({ status: "expired" }).eq("id", id);
    return NextResponse.json({ error: "下载链接已过期" }, { status: 410 });
  }

  const exportType = normalizeAdminExportType(job.export_type);
  if (!exportType) {
    return NextResponse.json({ error: "导出类型不支持" }, { status: 400 });
  }

  const filters = normalizeAdminExportFilters(job.filters);
  const data = await loadAdminExportData(exportType, filters);
  const exportedAt = new Date().toISOString();
  const csv = buildAdminExportCsv({
    data,
    exportType,
    exportedBy: auth.context.email || auth.context.userId,
    exportedAt,
    expiresAt: job.expires_at,
  });

  await writeAdminAuditLog(auth.context, {
    action: "export_job.download",
    resourceType: "admin_export_job",
    resourceId: id,
    reason: "download export",
    metadata: { exportType, rowCount: data.rows.length },
  });

  return new NextResponse(`\uFEFF${csv}`, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportType}-${id.slice(0, 8)}.csv"`,
    },
  });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
