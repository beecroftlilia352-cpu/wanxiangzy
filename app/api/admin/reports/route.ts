import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { getAdminCostReport } from "@/lib/admin/data";

export async function GET(request: Request) {
  const auth = await requireAdminApi("reports:read");
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  const days = Number(params.get("days") || 14);
  return NextResponse.json(await getAdminCostReport({ days }), { headers: { "Cache-Control": "no-store" } });
}
