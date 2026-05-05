import { NextRequest, NextResponse } from "next/server";
import { runScheduledBrainEvals } from "@/lib/agent/brain/eval-runner";
import { recordAgentMetric } from "@/lib/agent/brain/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  return handleRun(request);
}

export async function POST(request: NextRequest) {
  return handleRun(request);
}

async function handleRun(request: NextRequest) {
  const authError = validateProcessorAuth(request);
  if (authError) return authError;
  const started = Date.now();
  try {
    const result = await runScheduledBrainEvals({
      maxUsers: getMaxUsers(request),
      includeFeedbackCases: request.nextUrl.searchParams.get("feedback") !== "false",
    });
    void recordAgentMetric({
      event: "scheduled_agent_eval",
      route: "/api/jobs/run-agent-evals",
      ok: result.ok,
      latencyMs: Date.now() - started,
      metadata: { users: result.users, scores: result.results.map((item) => ({ userId: item.userId, score: item.score, failed: item.failed })) },
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[jobs] run-agent-evals failed:", err);
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : "Agent eval failed",
    }, { status: 500 });
  }
}

function validateProcessorAuth(request: NextRequest) {
  const expectedSecret = process.env.AGENT_EVAL_PROCESSOR_SECRET || process.env.JOB_PROCESSOR_SECRET || process.env.CRON_SECRET;
  if (!expectedSecret) {
    return NextResponse.json({ error: "AGENT_EVAL_PROCESSOR_SECRET/JOB_PROCESSOR_SECRET/CRON_SECRET 未配置" }, { status: 500 });
  }
  const authorization = request.headers.get("authorization") || "";
  if (authorization !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

function getMaxUsers(request: NextRequest) {
  const parsed = Number(request.nextUrl.searchParams.get("maxUsers") || process.env.AGENT_EVAL_MAX_USERS || 20);
  if (!Number.isFinite(parsed)) return 20;
  return Math.min(Math.max(Math.floor(parsed), 1), 100);
}
