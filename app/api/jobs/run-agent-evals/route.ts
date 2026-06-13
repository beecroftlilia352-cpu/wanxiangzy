// Agent module is temporarily disabled. This route is a no-op.
// The full implementation lives on the `refactor/extract-agent-module` branch.
// To restore, see `lib/agent/brain/eval-runner.ts` there.

import { NextRequest, NextResponse } from "next/server";
import { getConfiguredProcessorSecrets } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  return handleRun(request);
}

export async function POST(request: NextRequest) {
  return handleRun(request);
}

async function handleRun(request: NextRequest) {
  const authError = validateProcessorAuth(request);
  if (authError) return authError;
  return NextResponse.json({
    ok: true,
    users: 0,
    results: [],
    disabled: "agent module disabled",
  });
}

function validateProcessorAuth(request: NextRequest) {
  const secretConfig = getConfiguredProcessorSecrets(
    [
      { name: "AGENT_EVAL_PROCESSOR_SECRET", value: process.env.AGENT_EVAL_PROCESSOR_SECRET },
      { name: "JOB_PROCESSOR_SECRET", value: process.env.JOB_PROCESSOR_SECRET },
      { name: "CRON_SECRET", value: process.env.CRON_SECRET },
    ],
    "Agent eval processor"
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

function getMaxUsers(_request: NextRequest) {
  // Kept for backward compatibility with the previous query-string contract.
  return 20;
}
