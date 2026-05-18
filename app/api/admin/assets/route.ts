import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { listAdminAssets } from "@/lib/admin/data";

export async function GET(request: Request) {
  const auth = await requireAdminApi("tasks:read");
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  const assets = await listAdminAssets({
    q: params.get("q") || "",
    module: params.get("module") || "",
    limit: Number(params.get("limit") || 60),
  });

  return NextResponse.json(assets, { headers: { "Cache-Control": "no-store" } });
}
