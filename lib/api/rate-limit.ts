import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";

const BUCKET_TABLE = "rate_limit_buckets";

function getRateLimitClient() {
  try {
    return getAdminClient();
  } catch {
    console.warn("[rate-limit] Supabase admin client unavailable");
    return null;
  }
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ ok: true } | { ok: false; retryAfterSeconds: number }> {
  const supabase = getRateLimitClient();
  if (!supabase) return { ok: false, retryAfterSeconds: 30 };

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
