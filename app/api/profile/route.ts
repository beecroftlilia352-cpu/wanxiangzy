import { NextResponse } from "next/server";
import { getReadAuthenticatedUser } from "@/lib/api/read-auth";
import { createServerSupabase } from "@/lib/supabase/server";

const AUTH_CLAIMS_TIMEOUT_MS = 1_500;
const AUTH_USER_FALLBACK_TIMEOUT_MS = 3_000;
const PROFILE_QUERY_TIMEOUT_MS = 3_000;
const PROFILE_FIELDS = "display_name,credits,total_credits_used,created_at,updated_at";
const PROFILE_FIELDS_FALLBACK = "display_name,credits,created_at,updated_at";

export async function GET() {
  try {
    const supabase = await createServerSupabase({ readonlyCookies: true });
    const user = await getProfileUser(supabase);

    if (!user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    let { data, error } = await withTimeout(
      supabase
        .from("profiles")
        .select(PROFILE_FIELDS)
        .eq("id", user.id)
        .single(),
      PROFILE_QUERY_TIMEOUT_MS,
      "profile query timeout"
    );

    if (error && error.message.toLowerCase().includes("total_credits_used")) {
      const fallback = await withTimeout(
        supabase
          .from("profiles")
          .select(PROFILE_FIELDS_FALLBACK)
          .eq("id", user.id)
          .single(),
        PROFILE_QUERY_TIMEOUT_MS,
        "profile fallback query timeout"
      );
      data = fallback.data as typeof data;
      error = fallback.error;
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
      },
      profile: {
        displayName: stringValue(data?.display_name),
        createdAt: stringValue(data?.created_at),
        updatedAt: stringValue(data?.updated_at),
      },
      credits: data?.credits ?? 0,
      totalCreditsUsed: numberValue(data?.total_credits_used),
    });
  } catch (err: unknown) {
    if (process.env.NODE_ENV === "development") console.error("[profile] error:", err);
    return NextResponse.json({ error: "用户信息加载失败" }, { status: 500 });
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
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
