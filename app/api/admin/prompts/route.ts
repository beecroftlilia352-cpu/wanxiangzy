import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { getAdminPromptExperimentOverview } from "@/lib/admin/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApi("prompts:read");
  if (!auth.ok) return auth.response;

  return NextResponse.json(await getAdminPromptExperimentOverview(), {
    headers: { "Cache-Control": "no-store" },
  });
}
