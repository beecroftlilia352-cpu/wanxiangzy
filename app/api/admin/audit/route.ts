import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { listAdminAuditLogs } from "@/lib/admin/data";

export async function GET(request: Request) {
  const auth = await requireAdminApi("audit:read");
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  const audit = await listAdminAuditLogs({ limit: Number(params.get("limit") || 50) });

  return NextResponse.json(audit, { headers: { "Cache-Control": "no-store" } });
}
