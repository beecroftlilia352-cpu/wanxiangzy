import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";
import { runBrainEvalSuite } from "@/lib/agent/brain/eval-runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const limit = await checkRateLimit(`agent-evals-list:${auth.user.id}`, 60, 60_000);
  if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

  const { data, error } = await auth.supabase
    .from("agent_eval_runs")
    .select("id,total,passed,failed,score,latency_ms,created_at")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({
      error: "Eval tables are not ready. Run supabase/agent-brain-traces.sql first.",
      detail: error.message,
    }, { status: 503 });
  }
  return NextResponse.json({ runs: data || [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const limit = await checkRateLimit(`agent-evals-run:${auth.user.id}`, 5, 60_000);
  if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

  const body = await request.json().catch(() => ({}));
  const result = await runBrainEvalSuite({
    userId: auth.user.id,
    includeFeedbackCases: body.includeFeedbackCases !== false,
    maxFeedbackCases: Math.min(Math.max(Number(body.maxFeedbackCases) || 20, 0), 50),
  });
  return NextResponse.json({ ok: result.failed === 0, ...result });
}
