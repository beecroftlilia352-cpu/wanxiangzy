import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { API_RATE_LIMITS, enforceApiRateLimit } from "@/lib/api/rate-limit";
import { resourceLibraryErrorResponse } from "@/lib/resource-library/http";
import {
  createUserPrompt,
  listUserPrompts,
  parseUserPromptListQuery,
} from "@/lib/resource-library/server";

export async function GET(request: Request) {
  try {
    const { supabase, user, response } = await requireApiUser();
    if (!user) return response;
    const rateLimit = await enforceApiRateLimit(user.id, API_RATE_LIMITS.historyRead);
    if (rateLimit) return rateLimit;

    const query = parseUserPromptListQuery(new URL(request.url).searchParams);
    const result = await listUserPrompts(supabase, user.id, query);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, max-age=5, stale-while-revalidate=10" },
    });
  } catch (error) {
    return resourceLibraryErrorResponse(error, "提示词加载失败");
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user, response } = await requireApiUser();
    if (!user) return response;
    const rateLimit = await enforceApiRateLimit(user.id, API_RATE_LIMITS.favoriteMutation);
    if (rateLimit) return rateLimit;

    const body: unknown = await request.json().catch(() => null);
    const prompt = await createUserPrompt(supabase, user.id, body);
    return NextResponse.json({ prompt }, { status: 201 });
  } catch (error) {
    return resourceLibraryErrorResponse(error, "提示词创建失败");
  }
}
