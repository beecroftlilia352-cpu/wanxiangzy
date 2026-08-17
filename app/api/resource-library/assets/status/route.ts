import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { API_RATE_LIMITS, enforceApiRateLimit } from "@/lib/api/rate-limit";
import { resourceLibraryErrorResponse } from "@/lib/resource-library/http";
import { getResourceLibraryAssetStatuses } from "@/lib/resource-library/server";

export async function POST(request: Request) {
  try {
    const { supabase, user, response } = await requireApiUser();
    if (!user) return response;
    const rateLimit = await enforceApiRateLimit(user.id, API_RATE_LIMITS.historyRead);
    if (rateLimit) return rateLimit;

    const body: unknown = await request.json().catch(() => null);
    const items = await getResourceLibraryAssetStatuses(supabase, user.id, body);
    return NextResponse.json({ items }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return resourceLibraryErrorResponse(error, "收藏状态加载失败");
  }
}
