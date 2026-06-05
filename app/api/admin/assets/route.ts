import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { listAdminAssets } from "@/lib/admin/data";
import { parseAdminListQuery } from "@/lib/admin/query";

export async function GET(request: Request) {
  const auth = await requireAdminApi("assets:read");
  if (!auth.ok) return auth.response;

  const query = parseAdminListQuery(new URL(request.url).searchParams, {
    defaultPageSize: 60,
    maxPageSize: 200,
    allowedSorts: ["createdAt", "updatedAt", "module", "status"],
  });
  const assets = await listAdminAssets({
    q: query.q,
    module: query.module,
    limit: query.pageSize,
  });

  return NextResponse.json({ ...assets, query }, { headers: { "Cache-Control": "no-store" } });
}
