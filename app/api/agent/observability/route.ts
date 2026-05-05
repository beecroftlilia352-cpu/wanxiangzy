import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const limit = await checkRateLimit(`agent-observability:${auth.user.id}`, 60, 60_000);
  if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

  const { data, error } = await auth.supabase
    .from("agent_observability_events")
    .select("id,event,route,ok,latency_ms,confidence,module,action,metadata,created_at")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({
      error: "Agent observability table is not ready. Run supabase/agent-brain-traces.sql first.",
      detail: error.message,
    }, { status: 503 });
  }

  const events = data || [];
  const total = events.length;
  const failures = events.filter((event) => !event.ok).length;
  const latencies = events
    .map((event) => Number(event.latency_ms))
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
  const p50 = percentile(latencies, 0.5);
  const p95 = percentile(latencies, 0.95);

  return NextResponse.json({
    ok: true,
    summary: {
      total,
      failures,
      failureRate: total ? failures / total : 0,
      latencyP50: p50,
      latencyP95: p95,
    },
    events,
  });
}

function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * p) - 1));
  return values[index];
}
