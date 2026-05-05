import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { appendWorkflowEvent, getWorkflowBundle, setWorkflowStatus, updateStepDefinition } from "@/lib/agent/workflow/repository";
import { resetDependentSteps } from "@/lib/agent/workflow/step-mutations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; stepId: string }> }
) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;
  try {
    const { id, stepId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const bundle = await getWorkflowBundle(id, auth.user.id);
    const step = bundle.steps.find((item) => item.id === stepId || item.step_key === stepId);
    if (!step) return NextResponse.json({ error: "Step 不存在" }, { status: 404 });
    if (step.status === "running") return NextResponse.json({ error: "运行中的步骤不能编辑" }, { status: 409 });

    const nextParams = body.params && typeof body.params === "object"
      ? { ...step.params, ...body.params }
      : step.params;
    const nextInput = body.input && typeof body.input === "object"
      ? { ...step.input, ...body.input }
      : step.input;

    await updateStepDefinition(step.id, {
      params: nextParams,
      input: nextInput,
      title: typeof body.title === "string" ? body.title : undefined,
      status: step.depends_on.length ? "pending" : "ready",
    });
    await resetDependentSteps(bundle.steps, step.step_key);
    await setWorkflowStatus(id, "queued", { error_message: null });
    await appendWorkflowEvent({
      workflowId: id,
      stepId: step.id,
      type: "plan_repaired",
      message: `${step.title} edited by user`,
      payload: { params: nextParams, input: nextInput },
    });
    const refreshed = await getWorkflowBundle(id, auth.user.id);
    return NextResponse.json({ ok: true, ...refreshed });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "编辑 step 失败" }, { status: 500 });
  }
}
