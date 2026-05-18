import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { getAdminWorkerOverview } from "@/lib/admin/data";

export async function GET() {
  const auth = await requireAdminApi("workers:read");
  if (!auth.ok) return auth.response;

  return NextResponse.json(await getAdminWorkerOverview(), { headers: { "Cache-Control": "no-store" } });
}
