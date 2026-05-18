import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { getAdminAssetLifecycleOverview } from "@/lib/admin/data";

export async function GET(request: Request) {
  const auth = await requireAdminApi("assets:read");
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  const overview = await getAdminAssetLifecycleOverview({
    q: params.get("q") || "",
    module: params.get("module") || "",
    limit: Number(params.get("limit") || 100),
  });

  return NextResponse.json(overview, { headers: { "Cache-Control": "no-store" } });
}
