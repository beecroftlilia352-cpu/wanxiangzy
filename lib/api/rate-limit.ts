import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";

const BUCKET_TABLE = "rate_limit_buckets";

/**
 * 检查速率限制（fail-closed 设计）
 * 当 Supabase 不可用时，拒绝请求而非放行，防止限流失效。
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ ok: true } | { ok: false; retryAfterSeconds: number }> {
  let supabase;
  try {
    supabase = getAdminClient();
  } catch {
    console.error("[rate-limit] Supabase admin client 初始化失败，拒绝请求");
    return { ok: false, retryAfterSeconds: 60 };
  }

  const now = Date.now();
  const windowStart = now - windowMs;

  try {
    const { data, error } = await supabase.rpc("check_rate_limit", {
      p_key: key,
      p_limit: limit,
      p_window_start: new Date(windowStart).toISOString(),
      p_now: new Date(now).toISOString(),
      p_window_ms: windowMs,
    });

    if (error) {
      console.error("[rate-limit] rpc error:", error.message);
      // fail-closed: RPC 失败时拒绝请求
      return { ok: false, retryAfterSeconds: 30 };
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (row?.allowed) return { ok: true };

    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((row?.retry_after_ms ?? windowMs) / 1000)),
    };
  } catch (err) {
    console.error("[rate-limit] error:", err);
    // fail-closed: 异常时拒绝请求
    return { ok: false, retryAfterSeconds: 30 };
  }
}

export function rateLimitResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: "请求过于频繁，请稍后再试" },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds) },
    }
  );
}
