import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";

const BUCKET_TABLE = "rate_limit_buckets";
const ONE_MINUTE_MS = 60_000;

export type ApiRateLimitPolicy = {
  bucket: string;
  limit: number;
  windowMs: number;
};

export const API_RATE_LIMITS = {
  tryonGenerate: { bucket: "tryon", limit: 20, windowMs: ONE_MINUTE_MS },
  agentWorkflowCreate: { bucket: "agent-workflow-create", limit: 12, windowMs: ONE_MINUTE_MS },
  agentWorkflowPlan: { bucket: "agent-workflow-plan", limit: 20, windowMs: ONE_MINUTE_MS },
  agentWorkflowMutation: { bucket: "agent-workflow-mutation", limit: 30, windowMs: ONE_MINUTE_MS },
  conversationReadMutation: { bucket: "conversation-read-mutation", limit: 120, windowMs: ONE_MINUTE_MS },
  conversationMutation: { bucket: "conversation-mutation", limit: 60, windowMs: ONE_MINUTE_MS },
  messageMutation: { bucket: "message-mutation", limit: 120, windowMs: ONE_MINUTE_MS },
  favoriteMutation: { bucket: "favorite-mutation", limit: 60, windowMs: ONE_MINUTE_MS },
  apiPlatformTestProxy: { bucket: "api-platform-test-proxy", limit: 5, windowMs: ONE_MINUTE_MS },
  taskQueueRead: { bucket: "task-queue-read", limit: 120, windowMs: ONE_MINUTE_MS },
  historyRead: { bucket: "history-read", limit: 120, windowMs: ONE_MINUTE_MS },
} as const satisfies Record<string, ApiRateLimitPolicy>;

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

export async function enforceApiRateLimit(userId: string, policy: ApiRateLimitPolicy) {
  const limit = await checkRateLimit(`${policy.bucket}:${userId}`, policy.limit, policy.windowMs);
  return limit.ok ? null : rateLimitResponse(limit.retryAfterSeconds);
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
