import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";
import { estimateWorkflowCost } from "@/lib/agent/workflow/cost";
import { planWorkflow } from "@/lib/agent/workflow/planner";
import { applyDefaultsToPlan, normalizeGenerationDefaults, normalizeWorkflowImages, normalizeWorkflowMode } from "@/lib/agent/workflow/request";
import { validateWorkflowPlan } from "@/lib/agent/workflow/validator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const limit = await checkRateLimit(`agent-workflow-plan:${auth.user.id}`, 20, 60_000);
  if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

  try {
    const body = await request.json().catch(() => ({}));
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const images = normalizeWorkflowImages(body.images);
    const mode = normalizeWorkflowMode(body.mode);
    const defaults = normalizeGenerationDefaults(body.params);

    if (!message && images.length === 0) {
      return NextResponse.json({ error: "请输入任务描述或上传图片" }, { status: 400 });
    }

    const rawPlan = await planWorkflow({
      userText: message,
      images,
      mode,
      defaults,
      conversationSummary: typeof body.conversationSummary === "string" ? body.conversationSummary : undefined,
      activeWorkflowSummary: typeof body.activeWorkflowSummary === "string" ? body.activeWorkflowSummary : undefined,
      userPreferences: body.userPreferences && typeof body.userPreferences === "object" ? body.userPreferences : undefined,
    });
    const plan = applyDefaultsToPlan(rawPlan, defaults);
    const validation = validateWorkflowPlan({ plan, images, defaults });
    const finalPlan = validation.repairedPlan || plan;
    const costEstimate = estimateWorkflowCost(finalPlan, defaults);

    return NextResponse.json({
      ok: validation.ok,
      plan: finalPlan,
      validation,
      costEstimate,
      defaults,
      confirmation: {
        summary: finalPlan.summary,
        steps: finalPlan.steps.map((step) => ({ id: step.id, title: step.title, type: step.type })),
        totalCredits: costEstimate.total,
        needsClarification: finalPlan.needsClarification || !validation.ok && Boolean(validation.clarificationQuestion),
      },
    });
  } catch (err) {
    console.error("[agent-workflows/plan] error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "规划 workflow 失败" },
      { status: 500 }
    );
  }
}
