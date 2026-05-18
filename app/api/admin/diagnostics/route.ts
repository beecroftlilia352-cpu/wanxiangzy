import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { getAdminDiagnostics } from "@/lib/admin/data";

export async function GET() {
  const auth = await requireAdminApi("diagnostics:read");
  if (!auth.ok) return auth.response;

  return NextResponse.json(await getAdminDiagnostics(), { headers: { "Cache-Control": "no-store" } });
}
