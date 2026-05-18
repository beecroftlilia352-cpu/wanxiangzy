import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { listAdminTasks } from "@/lib/admin/data";

export async function GET(request: Request) {
  const auth = await requireAdminApi("tasks:read");
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  const tasks = await listAdminTasks({
    q: params.get("q") || "",
    module: params.get("module") || "",
    status: params.get("status") || "",
    sourceType: normalizeSourceType(params.get("sourceType")),
    stale: params.get("stale") === "1" || params.get("stale") === "true",
    limit: Number(params.get("limit") || 50),
  });

  return NextResponse.json(tasks, { headers: { "Cache-Control": "no-store" } });
}

function normalizeSourceType(value: string | null): "generation" | "workflow" | "all" {
  return value === "generation" || value === "workflow" ? value : "all";
}
