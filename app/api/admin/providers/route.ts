import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { getAdminProviderCatalog } from "@/lib/admin/data";

export async function GET() {
  const auth = await requireAdminApi("providers:read");
  if (!auth.ok) return auth.response;

  return NextResponse.json(await getAdminProviderCatalog(), { headers: { "Cache-Control": "no-store" } });
}
