import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { listAdminCreditLogs } from "@/lib/admin/data";

export async function GET(request: Request) {
  const auth = await requireAdminApi("credits:read");
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  const credits = await listAdminCreditLogs({
    q: params.get("q") || "",
    limit: Number(params.get("limit") || 80),
  });

  return NextResponse.json(credits, { headers: { "Cache-Control": "no-store" } });
}
