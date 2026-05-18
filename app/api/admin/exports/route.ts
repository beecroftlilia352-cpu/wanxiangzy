import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { listAdminExportJobs } from "@/lib/admin/data";
import {
  loadAdminExportData,
  normalizeAdminExportFilters,
  normalizeAdminExportType,
} from "@/lib/admin/exports";
import { getAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const auth = await requireAdminApi("exports:read");
  if (!auth.ok) return auth.response;

  return NextResponse.json(await listAdminExportJobs({ limit: 80 }), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi("exports:write");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({})) as {
    exportType?: unknown;
    filters?: unknown;
    reason?: unknown;
  };
  const exportType = normalizeAdminExportType(body.exportType);
  const filters = normalizeAdminExportFilters(body.filters);
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (!exportType) {
    return NextResponse.json({ error: "exportType 不合法" }, { status: 400 });
  }
  if (reason.length < 4 || reason.length > 240) {
    return NextResponse.json({ error: "reason 需要 4-240 个字符" }, { status: 400 });
  }

  const exportData = await loadAdminExportData(exportType, filters);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const token = randomUUID().replace(/-/g, "");
  const { data, error } = await getAdminClient()
    .from("admin_export_jobs")
    .insert({
      export_type: exportType,
      status: "ready",
      requested_by: auth.context.userId,
      requested_by_email: auth.context.email,
      requested_by_role: auth.context.role,
      filters,
      row_count: exportData.rows.length,
      download_token: token,
      expires_at: expiresAt,
    })
    .select("id,export_type,status,requested_by,requested_by_email,requested_by_role,filters,row_count,download_token,expires_at,error_message,created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await writeAdminAuditLog(auth.context, {
    action: "export_job.create",
    resourceType: "admin_export_job",
    resourceId: String(data?.id || ""),
    reason,
    metadata: { exportType, filters, rowCount: exportData.rows.length, expiresAt },
  });

  return NextResponse.json({ ok: true, exportJob: data }, { headers: { "Cache-Control": "no-store" } });
}
