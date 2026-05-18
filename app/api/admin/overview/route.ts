import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { getAdminOverview } from "@/lib/admin/data";

export async function GET() {
  const auth = await requireAdminApi("admin:read");
  if (!auth.ok) return auth.response;

  const overview = await getAdminOverview();
  return NextResponse.json(overview, { headers: { "Cache-Control": "no-store" } });
}
