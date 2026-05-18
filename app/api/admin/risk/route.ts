import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { getAdminRiskOverview } from "@/lib/admin/data";

export async function GET(request: Request) {
  const auth = await requireAdminApi("risk:read");
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  const overview = await getAdminRiskOverview({
    q: params.get("q") || "",
    level: params.get("level") || "",
    days: Number(params.get("days") || 30),
    limit: Number(params.get("limit") || 80),
  });

  return NextResponse.json(overview, { headers: { "Cache-Control": "no-store" } });
}
