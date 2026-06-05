import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { listAdminUsers } from "@/lib/admin/data";
import { parseAdminListQuery } from "@/lib/admin/query";

export async function GET(request: Request) {
  const auth = await requireAdminApi("users:read");
  if (!auth.ok) return auth.response;

  const query = parseAdminListQuery(new URL(request.url).searchParams, {
    defaultPageSize: 50,
    maxPageSize: 200,
    allowedSorts: ["createdAt", "updatedAt", "email", "credits"],
  });
  const users = await listAdminUsers({
    q: query.q,
    limit: query.pageSize,
  });

  return NextResponse.json({ ...users, query }, { headers: { "Cache-Control": "no-store" } });
}
