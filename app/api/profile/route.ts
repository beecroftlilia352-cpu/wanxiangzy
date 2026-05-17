import { NextResponse } from "next/server";
import { getReadAuthenticatedUser } from "@/lib/api/read-auth";
import { createServerSupabase } from "@/lib/supabase/server";

const AUTH_CLAIMS_TIMEOUT_MS = 1_500;
const AUTH_USER_FALLBACK_TIMEOUT_MS = 3_000;
const PROFILE_QUERY_TIMEOUT_MS = 3_000;

export async function GET() {
  try {
    const supabase = await createServerSupabase({ readonlyCookies: true });
    const user = await getProfileUser(supabase);

    if (!user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const { data, error } = await withTimeout(
      supabase
        .from("profiles")
        .select("credits")
        .eq("id", user.id)
        .single(),
      PROFILE_QUERY_TIMEOUT_MS,
      "profile query timeout"
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
      },
      credits: data?.credits ?? 0,
    });
  } catch (err: unknown) {
    if (process.env.NODE_ENV === "development") console.error("[profile] error:", err);
    return NextResponse.json({ error: "用户信息加载失败" }, { status: 500 });
  }
}

async function getProfileUser(supabase: Awaited<ReturnType<typeof createServerSupabase>>) {
  return getReadAuthenticatedUser(supabase, {
    claimsTimeoutMs: AUTH_CLAIMS_TIMEOUT_MS,
    userFallbackTimeoutMs: AUTH_USER_FALLBACK_TIMEOUT_MS,
  });
}

function withTimeout<T>(promise: PromiseLike<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}
