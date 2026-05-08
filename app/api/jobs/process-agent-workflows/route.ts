import { NextRequest, NextResponse } from "next/server";
import { runNextAgentWorkflows } from "@/lib/agent/workflow/runtime";
import { getConfiguredProcessorSecrets } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  return handleProcessRequest(request);
}

export async function POST(request: NextRequest) {
  return handleProcessRequest(request);
}

async function handleProcessRequest(request: NextRequest) {
  const authError = validateProcessorAuth(request);
  if (authError) return authError;

  try {
    const result = await runNextAgentWorkflows(getBatchLimit(request));
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[jobs] process-agent-workflows failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Agent workflow processing failed" },
      { status: 500 }
    );
  }
}

function validateProcessorAuth(request: NextRequest) {
  const secretConfig = getConfiguredProcessorSecrets(
    [
      { name: "AGENT_WORKFLOW_PROCESSOR_SECRET", value: process.env.AGENT_WORKFLOW_PROCESSOR_SECRET },
      { name: "JOB_PROCESSOR_SECRET", value: process.env.JOB_PROCESSOR_SECRET },
      { name: "CRON_SECRET", value: process.env.CRON_SECRET },
    ],
    "Agent workflow processor"
  );
  if (!secretConfig.ok) {
    return NextResponse.json({ error: secretConfig.message }, { status: 500 });
  }
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
  if (!secretConfig.secrets.includes(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

function getBatchLimit(request: NextRequest) {
  const rawLimit = request.nextUrl.searchParams.get("limit") || process.env.AGENT_WORKFLOW_BATCH_SIZE;
  const parsed = Number(rawLimit || 2);
  if (!Number.isFinite(parsed)) return 2;
  return Math.min(Math.max(Math.floor(parsed), 1), 10);
}
