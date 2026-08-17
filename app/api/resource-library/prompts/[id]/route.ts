import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { API_RATE_LIMITS, enforceApiRateLimit } from "@/lib/api/rate-limit";
import { resourceLibraryErrorResponse } from "@/lib/resource-library/http";
import { softDeleteUserPrompt, updateUserPrompt } from "@/lib/resource-library/server";

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, { params }: RouteProps) {
  try {
    const { id } = await params;
    const { supabase, user, response } = await requireApiUser();
    if (!user) return response;
    const rateLimit = await enforceApiRateLimit(user.id, API_RATE_LIMITS.favoriteMutation);
    if (rateLimit) return rateLimit;

    const body: unknown = await request.json().catch(() => null);
    const prompt = await updateUserPrompt(supabase, user.id, id, body);
    return NextResponse.json({ prompt });
  } catch (error) {
    return resourceLibraryErrorResponse(error, "提示词更新失败");
  }
}

export async function DELETE(_request: Request, { params }: RouteProps) {
  try {
    const { id } = await params;
    const { supabase, user, response } = await requireApiUser();
    if (!user) return response;
    const rateLimit = await enforceApiRateLimit(user.id, API_RATE_LIMITS.favoriteMutation);
    if (rateLimit) return rateLimit;

    await softDeleteUserPrompt(supabase, user.id, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return resourceLibraryErrorResponse(error, "提示词删除失败");
  }
}
