// Agent module is temporarily disabled. This route is a no-op.
// The full implementation lives on the `refactor/extract-agent-module` branch.
// To restore, see `lib/agent/workflow/runtime.ts` there.

import { NextRequest, NextResponse } from "next/server";
import { getConfiguredProcessorSecrets } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  return handleProcessRequest(request);
}

export async function POST(request: NextRequest) {
  return handleProcessRequest(request);
}

async function handleProcessRequest(request: NextRequest) {
  const authError = validateProcessorAuth(request);
  if (authError) return authError;
  return NextResponse.json({
    ok: true,
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
    disabled: "agent module disabled",
  });
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
