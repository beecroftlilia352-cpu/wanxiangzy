import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { getAdminAgentEvalOverview } from "@/lib/admin/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminApi("evals:read");
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  return NextResponse.json(
    await getAdminAgentEvalOverview({
      q: params.get("q") || "",
      limit: Number(params.get("limit") || 50),
    }),
    { headers: { "Cache-Control": "no-store" } },
  );
}
