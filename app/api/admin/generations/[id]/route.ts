import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { getAdminTaskDetail } from "@/lib/admin/data";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireAdminApi("tasks:read");
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "无效任务 ID" }, { status: 400 });
  }

  const detail = await getAdminTaskDetail(id);
  if (!detail.task && !detail.queueItem) {
    return NextResponse.json({ error: "任务不存在", detail }, { status: 404 });
  }

  return NextResponse.json(detail, { headers: { "Cache-Control": "no-store" } });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
