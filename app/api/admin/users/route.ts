import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { listAdminUsers } from "@/lib/admin/data";

export async function GET(request: Request) {
  const auth = await requireAdminApi("users:read");
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  const users = await listAdminUsers({
    q: params.get("q") || "",
    limit: Number(params.get("limit") || 50),
  });

  return NextResponse.json(users, { headers: { "Cache-Control": "no-store" } });
}
