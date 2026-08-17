import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { API_RATE_LIMITS, enforceApiRateLimit } from "@/lib/api/rate-limit";
import { getAdminClient } from "@/lib/supabase/admin";
import { resourceLibraryErrorResponse } from "@/lib/resource-library/http";
import { softDeleteResourceLibraryAsset } from "@/lib/resource-library/server";

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: Request, { params }: RouteProps) {
  try {
    const { id } = await params;
    const { user, response } = await requireApiUser();
    if (!user) return response;
    const rateLimit = await enforceApiRateLimit(user.id, API_RATE_LIMITS.favoriteMutation);
    if (rateLimit) return rateLimit;

    await softDeleteResourceLibraryAsset(getAdminClient(), user.id, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return resourceLibraryErrorResponse(error, "移出资源仓库失败");
  }
}
