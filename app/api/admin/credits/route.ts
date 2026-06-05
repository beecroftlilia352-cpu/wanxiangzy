import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { listAdminCreditLogs } from "@/lib/admin/data";
import { parseAdminListQuery } from "@/lib/admin/query";

export async function GET(request: Request) {
  const auth = await requireAdminApi("credits:read");
  if (!auth.ok) return auth.response;

  const query = parseAdminListQuery(new URL(request.url).searchParams, {
    defaultPageSize: 80,
    maxPageSize: 200,
    allowedSorts: ["createdAt", "amount", "balance"],
  });
  const credits = await listAdminCreditLogs({
    q: query.q,
    limit: query.pageSize,
  });

  return NextResponse.json({ ...credits, query }, { headers: { "Cache-Control": "no-store" } });
}
