import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { API_RATE_LIMITS, enforceApiRateLimit } from "@/lib/api/rate-limit";
import { appendWorkflowEvent, getWorkflowBundle, setStepStatus, setWorkflowStatus } from "@/lib/agent/workflow/repository";
import { queueSatisfiedPendingSteps, resetDependentSteps } from "@/lib/agent/workflow/step-mutations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; stepId: string }> }
) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  const rateLimit = await enforceApiRateLimit(auth.user.id, API_RATE_LIMITS.agentWorkflowMutation);
  if (rateLimit) return rateLimit;
  try {
    const { id, stepId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const selectedImageUrl = typeof body.selectedImageUrl === "string" ? body.selectedImageUrl : "";
    if (!selectedImageUrl) return NextResponse.json({ error: "缺少 selectedImageUrl" }, { status: 400 });
    const bundle = await getWorkflowBundle(id, auth.user.id);
    const step = bundle.steps.find((item) => item.id === stepId || item.step_key === stepId);
    if (!step) return NextResponse.json({ error: "Step 不存在" }, { status: 404 });
    await setStepStatus(step.id, "completed", {
      output: { selectedImageUrl, imageUrls: [selectedImageUrl], text: "用户已手动选择图片继续。" },
      errorMessage: null,
    });
    await resetDependentSteps(bundle.steps, step.step_key);
    await queueSatisfiedPendingSteps(bundle.steps, { [step.step_key]: "completed" });
    await setWorkflowStatus(id, "queued", { error_message: null });
    await appendWorkflowEvent({
      workflowId: id,
      stepId: step.id,
      type: "step_completed",
      message: `${step.title} selected by user`,
      payload: { selectedImageUrl },
    });
    const refreshed = await getWorkflowBundle(id, auth.user.id);
    return NextResponse.json({ ok: true, ...refreshed });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "选择图片失败" }, { status: 500 });
  }
}
