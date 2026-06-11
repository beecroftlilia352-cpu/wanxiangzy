import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { listAdminBillingOverview } from "@/lib/billing/admin";

export async function GET() {
  const auth = await requireAdminApi("billing:read");
  if (!auth.ok) return auth.response;

  const overview = await listAdminBillingOverview();
  return NextResponse.json(overview, { headers: { "Cache-Control": "no-store" } });
}
