import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { API_RATE_LIMITS, enforceApiRateLimit } from "@/lib/api/rate-limit";
import { appendWorkflowEvent, getWorkflowBundle, setStepStatus, setWorkflowStatus } from "@/lib/agent/workflow/repository";
import { skipDependentSteps } from "@/lib/agent/workflow/step-mutations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string; stepId: string }> }
) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const rateLimit = await enforceApiRateLimit(auth.user.id, API_RATE_LIMITS.agentWorkflowMutation);
  if (rateLimit) return rateLimit;
  try {
    const { id, stepId } = await context.params;
    const bundle = await getWorkflowBundle(id, auth.user.id);
    const step = bundle.steps.find((item) => item.id === stepId || item.step_key === stepId);
    if (!step) return NextResponse.json({ error: "Step 不存在" }, { status: 404 });
    if (step.status === "completed") return NextResponse.json({ error: "已完成步骤不能跳过" }, { status: 409 });
    await setStepStatus(step.id, "skipped", { errorMessage: null });
    await skipDependentSteps(bundle.steps, step.step_key);
    await setWorkflowStatus(id, "queued", { error_message: null });
    await appendWorkflowEvent({ workflowId: id, stepId: step.id, type: "step_skipped", message: `${step.title} skipped by user` });
    const refreshed = await getWorkflowBundle(id, auth.user.id);
    return NextResponse.json({ ok: true, ...refreshed });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "跳过 step 失败" }, { status: 500 });
  }
}
