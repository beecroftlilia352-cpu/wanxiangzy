import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { listAdminTasks } from "@/lib/admin/data";
import { parseAdminListQuery } from "@/lib/admin/query";

export async function GET(request: Request) {
  const auth = await requireAdminApi("tasks:read");
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  const query = parseAdminListQuery(params, {
    defaultPageSize: 50,
    maxPageSize: 200,
    allowedSorts: ["createdAt", "updatedAt", "status", "module"],
  });
  const tasks = await listAdminTasks({
    q: query.q,
    module: query.module,
    status: query.status,
    sourceType: normalizeSourceType(params.get("sourceType")),
    stale: params.get("stale") === "1" || params.get("stale") === "true",
    page: query.page,
    pageSize: query.pageSize,
  });

  return NextResponse.json({ ...tasks, query }, { headers: { "Cache-Control": "no-store" } });
}

function normalizeSourceType(value: string | null): "generation" | "workflow" | "all" {
  return value === "generation" || value === "workflow" ? value : "all";
}
