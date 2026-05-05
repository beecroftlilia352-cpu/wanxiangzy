import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";
import { estimateWorkflowCost } from "@/lib/agent/workflow/cost";
import { planWorkflow } from "@/lib/agent/workflow/planner";
import { applyDefaultsToPlan, normalizeGenerationDefaults, normalizeWorkflowImages, normalizeWorkflowMode } from "@/lib/agent/workflow/request";
import { validateWorkflowPlan } from "@/lib/agent/workflow/validator";
import { critiqueWorkflowPlan } from "@/lib/agent/brain/critic";
import { createBrainTrace } from "@/lib/agent/brain/trace";
import { getAgentUserPreferences } from "@/lib/agent/brain/preferences";
import { getAgentFeatureFlags } from "@/lib/agent/brain/feature-flags";
import { recordAgentMetric } from "@/lib/agent/brain/metrics";
import { getAgentKnowledgeContext, buildKnowledgePrompt } from "@/lib/agent/brain/knowledge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const started = Date.now();
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
    const flags = getAgentFeatureFlags(auth.user.id);
    const userPreferences = body.userPreferences && typeof body.userPreferences === "object"
      ? body.userPreferences
      : flags.memory
        ? await getAgentUserPreferences(auth.user.id)
        : undefined;
    const projectKnowledge = flags.memory
      ? await getAgentKnowledgeContext({
        userId: auth.user.id,
        conversationId: typeof body.conversationId === "string" ? body.conversationId : null,
        query: message,
      })
      : [];

    if (!message && images.length === 0) {
      return NextResponse.json({ error: "请输入任务描述或上传图片" }, { status: 400 });
    }

    const trace = createBrainTrace();
    const rawPlan = await planWorkflow({
      userText: message,
      images,
      mode,
      defaults,
      conversationSummary: typeof body.conversationSummary === "string" ? body.conversationSummary : undefined,
      activeWorkflowSummary: typeof body.activeWorkflowSummary === "string" ? body.activeWorkflowSummary : undefined,
      userPreferences: {
        ...(userPreferences || {}),
        projectKnowledge: buildKnowledgePrompt(projectKnowledge),
      },
    });
    let plan = applyDefaultsToPlan(rawPlan, defaults);
    let validation = validateWorkflowPlan({ plan, images, defaults });
    const critique = await critiqueWorkflowPlan({
      userText: message,
      images,
      defaults,
      plan: validation.repairedPlan || plan,
      validation,
      trace,
    });
    if (critique.repairedPlan) {
      plan = applyDefaultsToPlan(critique.repairedPlan, defaults);
      validation = validateWorkflowPlan({ plan, images, defaults });
    }
    let finalPlan = validation.repairedPlan || plan;
    if (critique.clarificationQuestion && !critique.ok) {
      finalPlan = {
        ...finalPlan,
        needsClarification: true,
        clarificationQuestion: critique.clarificationQuestion,
      };
      validation = validateWorkflowPlan({ plan: finalPlan, images, defaults });
    }
    const costEstimate = estimateWorkflowCost(finalPlan, defaults);

    void recordAgentMetric({
      userId: auth.user.id,
      event: "workflow_plan",
      route: "/api/agent/workflows/plan",
      ok: validation.ok && critique.ok,
      latencyMs: Date.now() - started,
      confidence: finalPlan.confidence,
      module: finalPlan.intent,
      metadata: { stepCount: finalPlan.steps.length, flags },
    });

    return NextResponse.json({
      ok: validation.ok && critique.ok,
      plan: finalPlan,
      validation,
      critique,
      costEstimate,
      defaults,
      trace,
      confirmation: {
        summary: finalPlan.summary,
        steps: finalPlan.steps.map((step) => ({ id: step.id, title: step.title, type: step.type })),
        totalCredits: costEstimate.total,
        needsClarification: finalPlan.needsClarification || !validation.ok && Boolean(validation.clarificationQuestion),
      },
    });
  } catch (err) {
    console.error("[agent-workflows/plan] error:", err);
    void recordAgentMetric({
      userId: auth.user.id,
      event: "workflow_plan_error",
      route: "/api/agent/workflows/plan",
      ok: false,
      latencyMs: Date.now() - started,
      metadata: { error: err instanceof Error ? err.message : String(err) },
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "规划 workflow 失败" },
      { status: 500 }
    );
  }
}
