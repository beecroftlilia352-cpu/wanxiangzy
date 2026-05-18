import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { getAdminSettingsOverview } from "@/lib/admin/data";

export async function GET() {
  const auth = await requireAdminApi("settings:read");
  if (!auth.ok) return auth.response;

  return NextResponse.json(await getAdminSettingsOverview(), { headers: { "Cache-Control": "no-store" } });
}
