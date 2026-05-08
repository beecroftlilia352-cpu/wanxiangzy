import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { API_RATE_LIMITS, enforceApiRateLimit } from "@/lib/api/rate-limit";
import { appendWorkflowEvent, getWorkflowBundle, setWorkflowStatus } from "@/lib/agent/workflow/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const rateLimit = await enforceApiRateLimit(auth.user.id, API_RATE_LIMITS.agentWorkflowMutation);
  if (rateLimit) return rateLimit;

  try {
    const { id } = await context.params;
    const bundle = await getWorkflowBundle(id, auth.user.id);
    if (!["confirmed", "queued", "running"].includes(bundle.workflow.status)) {
      return NextResponse.json({ error: `当前状态 ${bundle.workflow.status} 不能入队执行` }, { status: 409 });
    }
    if (bundle.workflow.status !== "queued" && bundle.workflow.status !== "running") {
      await setWorkflowStatus(id, "queued");
      await appendWorkflowEvent({ workflowId: id, type: "workflow_queued", message: "Workflow queued by user" });
    }
    const refreshed = await getWorkflowBundle(id, auth.user.id);
    return NextResponse.json({ ok: true, ...refreshed });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "执行 workflow 失败" },
      { status: 500 }
    );
  }
}
