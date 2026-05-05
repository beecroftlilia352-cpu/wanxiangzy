import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";
import { estimateWorkflowCost } from "@/lib/agent/workflow/cost";
import { createWorkflowRecord } from "@/lib/agent/workflow/repository";
import { applyDefaultsToPlan, getIdempotencyKey, normalizeGenerationDefaults, normalizeWorkflowImages, normalizeWorkflowMode } from "@/lib/agent/workflow/request";
import { validateWorkflowPlan } from "@/lib/agent/workflow/validator";
import type { WorkflowPlan } from "@/lib/agent/workflow/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const limit = await checkRateLimit(`agent-workflow-create:${auth.user.id}`, 12, 60_000);
  if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

  try {
    const body = await request.json().catch(() => ({}));
    if (!isWorkflowPlan(body.plan)) {
      return NextResponse.json({ error: "缺少有效 workflow plan，请先调用 /plan" }, { status: 400 });
    }

    const images = normalizeWorkflowImages(body.images);
    const mode = normalizeWorkflowMode(body.mode);
    const defaults = normalizeGenerationDefaults(body.params);
    const plan = applyDefaultsToPlan(body.plan, defaults);
    const validation = validateWorkflowPlan({ plan, images, defaults });
    const finalPlan = validation.repairedPlan || plan;
    const costEstimate = estimateWorkflowCost(finalPlan, defaults);
    const bundle = await createWorkflowRecord({
      userId: auth.user.id,
      conversationId: typeof body.conversationId === "string" ? body.conversationId : null,
      mode,
      inputImages: images,
      plan: finalPlan,
      validation,
      costEstimate,
      idempotencyKey: getIdempotencyKey(request.headers, body),
    });

    return NextResponse.json({
      ok: validation.ok,
      workflow: bundle.workflow,
      steps: bundle.steps,
      events: bundle.events,
      assets: bundle.assets,
      validation,
      costEstimate,
    });
  } catch (err) {
    console.error("[agent-workflows] create error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "创建 workflow 失败" },
      { status: 500 }
    );
  }
}

function isWorkflowPlan(value: unknown): value is WorkflowPlan {
  return Boolean(
    value &&
    typeof value === "object" &&
    Array.isArray((value as { steps?: unknown }).steps) &&
    typeof (value as { summary?: unknown }).summary === "string"
  );
}
