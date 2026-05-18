import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { listAdminMembers } from "@/lib/admin/data";

export async function GET(request: Request) {
  const auth = await requireAdminApi("settings:read");
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  const members = await listAdminMembers({ limit: Number(params.get("limit") || 50) });

  return NextResponse.json(members, { headers: { "Cache-Control": "no-store" } });
}
