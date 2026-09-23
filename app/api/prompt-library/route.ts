import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { API_RATE_LIMITS, enforceApiRateLimit } from "@/lib/api/rate-limit";
import { promptLibraryErrorResponse } from "@/lib/prompt-library/http";
import {
  createPromptLibraryItem,
  listPromptLibraryItems,
  parsePromptLibraryListQuery,
} from "@/lib/prompt-library/server";

/**
 * 前台共享词库接口。
 *
 * GET  ?scope=all|mine&q=&creationType=&module=&cursor=&limit=
 *      scope=all（默认）返回共享词库：局域网内所有已登录用户都能看到全部未删除条目，
 *      含创建者（createdByEmail）与时间。scope=mine 只返回自己保存的。
 * POST 保存「我的提示词」到共享词库（title 1-20、content 1-2000）。
 */
export async function GET(request: Request) {
  try {
    const { supabase, user, response } = await requireApiUser();
    if (!user) return response;
    const rateLimit = await enforceApiRateLimit(user.id, API_RATE_LIMITS.historyRead);
    if (rateLimit) return rateLimit;

    const query = parsePromptLibraryListQuery(new URL(request.url).searchParams);
    const result = await listPromptLibraryItems(supabase, query, { viewerId: user.id });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, max-age=5, stale-while-revalidate=10" },
    });
  } catch (error) {
    return promptLibraryErrorResponse(error, "词库加载失败");
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user, response } = await requireApiUser();
    if (!user) return response;
    const rateLimit = await enforceApiRateLimit(user.id, API_RATE_LIMITS.favoriteMutation);
    if (rateLimit) return rateLimit;

    const body: unknown = await request.json().catch(() => null);
    const prompt = await createPromptLibraryItem(
      supabase,
      { userId: user.id, email: user.email ?? null },
      body,
    );
    return NextResponse.json({ prompt }, { status: 201 });
  } catch (error) {
    return promptLibraryErrorResponse(error, "提示词保存失败");
  }
}
