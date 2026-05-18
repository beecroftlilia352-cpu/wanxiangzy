import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { listAdminModerationCases } from "@/lib/admin/data";

export async function GET(request: Request) {
  const auth = await requireAdminApi("moderation:read");
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  const cases = await listAdminModerationCases({
    q: params.get("q") || "",
    limit: Number(params.get("limit") || 60),
  });

  return NextResponse.json(cases, { headers: { "Cache-Control": "no-store" } });
}
