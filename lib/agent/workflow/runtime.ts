import { normalizeAspectRatio, normalizeImageSize, normalizeLingyaModel, type ImageSize } from "@/lib/api/lingya";
import { getStepExecutor } from "@/lib/agent/workflow/executors";
import {
  appendWorkflowEvent,
  claimNextAgentWorkflows,
  createWorkflowAssets,
  getWorkflowBundleForWorker,
  releaseWorkflowCredits,
  setStepStatus,
  setWorkflowStatus,
  settleWorkflowCredits,
  updateStepDefinition,
} from "@/lib/agent/workflow/repository";
import type { WorkflowBundle } from "@/lib/agent/workflow/repository";
import type { WorkflowCostEstimate, WorkflowStepRecord, WorkflowStepResultOutput } from "@/lib/agent/workflow/types";
import { getWorkflowTool } from "@/lib/agent/workflow/tools";

export async function runNextAgentWorkflows(limit = 2) {
  const ids = await claimNextAgentWorkflows(limit);
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const id of ids) {
    try {
      await runAgentWorkflowById(id);
      results.push({ id, ok: true });
    } catch (err) {
      results.push({ id, ok: false, error: err instanceof Error ? err.message : "workflow failed" });
    }
  }
  return { claimed: ids.length, results };
}

export async function runAgentWorkflowById(workflowId: string) {
  const bundle = await getWorkflowBundleForWorker(workflowId);
  if (!bundle) return { processed: 0, skipped: 1 };
  if (["completed", "failed", "cancelled"].includes(bundle.workflow.status)) {
    return { processed: 0, skipped: 1 };
  }

  await setWorkflowStatus(workflowId, "running");
  await appendWorkflowEvent({ workflowId, type: "workflow_queued", message: "Workflow picked by worker" });

  let current = bundle;
  while (true) {
    const ready = getReadySteps(current.steps);
    if (!ready.length) break;
    for (const step of ready) {
      await executeStep(current, step);
      const refreshed = await getWorkflowBundleForWorker(workflowId);
      if (!refreshed) throw new Error("Workflow disappeared during execution");
      current = refreshed;
      if (current.workflow.status === "failed") return { processed: 1, skipped: 0 };
    }
    await markNewReadySteps(current);
    const refreshed = await getWorkflowBundleForWorker(workflowId);
    if (!refreshed) throw new Error("Workflow disappeared during execution");
    current = refreshed;
  }

  await finalizeWorkflow(current);
  return { processed: 1, skipped: 0 };
}

async function executeStep(bundle: WorkflowBundle, step: WorkflowStepRecord) {
  const executor = getStepExecutor(step.type);
  if (!executor) {
    await failStep(bundle, step, `工具 ${step.type} 没有可用 executor`);
    return;
  }

  await setStepStatus(step.id, "running");
  await appendWorkflowEvent({
    workflowId: bundle.workflow.id,
    stepId: step.id,
    type: "step_started",
    message: `${step.title} started`,
    payload: { type: step.type },
  });

  try {
    const model = normalizeLingyaModel(step.params.model || step.params.aiModel || "gpt-image-2");
    const aspectRatio = normalizeAspectRatio(step.params.aspectRatio || step.params.aspect_ratio || "3:4");
    const imageSize = normalizeImageSize(model, String(step.params.imageSize || step.params.image_size || "1K") as ImageSize, aspectRatio);
    const result = await executor({
      workflow: bundle.workflow,
      step,
      steps: bundle.steps,
      inputImages: bundle.workflow.input_images,
      model,
      aspectRatio,
      imageSize,
    });
    const assets = result.output.imageUrls?.length
      ? await createWorkflowAssets({
        userId: bundle.workflow.user_id,
        workflowId: bundle.workflow.id,
        stepId: step.id,
        kind: "image",
        role: "intermediate",
        urls: result.output.imageUrls,
        provider: result.providerTrace?.[0]?.provider || null,
        model,
        metadata: { toolType: step.type, promptTrace: result.promptTrace || [] },
      })
      : [];
    const output = {
      ...result.output,
      assetIds: assets.length ? assets.map((asset) => asset.id) : result.output.assetIds,
    };
    await setStepStatus(step.id, "completed", { output, quality: result.quality || null });
    await appendWorkflowEvent({
      workflowId: bundle.workflow.id,
      stepId: step.id,
      type: "step_completed",
      message: `${step.title} completed`,
      payload: { output, quality: result.quality || null, providerTrace: result.providerTrace || [] },
    });
  } catch (err) {
    await failStep(bundle, step, err instanceof Error ? err.message : "step failed");
  }
}

async function failStep(bundle: WorkflowBundle, step: WorkflowStepRecord, message: string) {
  const nextRetry = step.retry_count + 1;
  const tool = getWorkflowTool(step.type);
  const maxAttempts = tool?.retryPolicy.maxAttempts ?? 3;
  const retryable = tool?.retryPolicy.retryable !== false && process.env.AGENT_WORKFLOW_SELF_REPAIR_ENABLED !== "false";

  await appendWorkflowEvent({
    workflowId: bundle.workflow.id,
    stepId: step.id,
    type: "step_failed",
    message,
    payload: { type: step.type, retryCount: nextRetry, maxAttempts },
  });

  if (retryable && nextRetry < maxAttempts) {
    const repaired = buildSelfRepairPatch(step, message, nextRetry);
    await updateStepDefinition(step.id, {
      params: repaired.params,
      input: repaired.input,
      title: repaired.title,
    });
    await setStepStatus(step.id, "ready", {
      errorMessage: message,
      retryCount: nextRetry,
    });
    await appendWorkflowEvent({
      workflowId: bundle.workflow.id,
      stepId: step.id,
      type: "step_retried",
      message: `${step.title} will retry with a repaired prompt`,
      payload: {
        retryCount: nextRetry,
        repairSummary: repaired.summary,
      },
    });
    return;
  }

  await setStepStatus(step.id, "failed", {
    errorMessage: message,
    retryCount: nextRetry,
  });
  if (nextRetry >= maxAttempts) {
    await finalizeFailedWorkflow(bundle.workflow.id, bundle.workflow.user_id, bundle.workflow.cost_estimate, bundle.workflow.cost_reserved, bundle.steps);
  }
}

function buildSelfRepairPatch(step: WorkflowStepRecord, message: string, retryCount: number) {
  const params = { ...step.params };
  const input = { ...step.input };
  const existingPrompt = typeof params.prompt === "string" ? params.prompt.trim() : "";
  const repairLines = [
    `失败复盘：第 ${retryCount} 次执行失败，原因是「${message.slice(0, 220)}」。`,
    "修复计划：重新检查输入图引用、输出数量、比例、提示词边界和用户原始目标；优先修复失败点，不要擅自切换任务类型。",
    getToolSpecificRepairLine(step.type),
  ].filter(Boolean);

  params.prompt = existingPrompt
    ? `${existingPrompt}\n\n${repairLines.join("\n")}`
    : repairLines.join("\n");
  params._selfRepair = {
    retryCount,
    lastError: message,
    repairedAt: new Date().toISOString(),
  };

  return {
    title: step.title,
    params,
    input,
    summary: repairLines.join(" "),
  };
}

function getToolSpecificRepairLine(type: string) {
  if (type === "commerce_detail") {
    return "详情页修复重点：必须保持电商详情页/长图版式，包含首屏、卖点、细节和参数区，不要变成单张种草图或街拍图。";
  }
  if (type === "pose_variation") {
    return "姿势裂变修复重点：保持人物身份、服装结构、身体比例和真实关节逻辑；若用户要求每张单独出图，则不要输出四宫格。";
  }
  if (type === "tryon") {
    return "换装修复重点：确认服装图和人物/参考图关系，严格保留服装版型、颜色、logo 和人物身份。";
  }
  if (type === "garment_3d") {
    return "3D 展示修复重点：当前输出是 3D 展示感图片，不是真实 3D 模型文件；保持商品结构和可检视细节。";
  }
  return "通用修复重点：保持用户原始目标、参考图角色和商业可用性，不要把任务改写成其他模块。";
}

async function markNewReadySteps(bundle: WorkflowBundle) {
  const completed = new Set(bundle.steps.filter((step) => step.status === "completed").map((step) => step.step_key));
  const pendingReady = bundle.steps.filter((step) =>
    step.status === "pending" &&
    step.depends_on.every((dep) => completed.has(dep))
  );
  for (const step of pendingReady) {
    await setStepStatus(step.id, "ready");
    await appendWorkflowEvent({
      workflowId: bundle.workflow.id,
      stepId: step.id,
      type: "step_queued",
      message: `${step.title} is ready`,
    });
  }
}

async function finalizeWorkflow(bundle: WorkflowBundle) {
  const failed = bundle.steps.filter((step) => step.status === "failed");
  const runnable = bundle.steps.filter((step) => !["skipped", "cancelled"].includes(step.status));
  const completed = runnable.filter((step) => step.status === "completed");

  if (failed.length) {
    await finalizeFailedWorkflow(bundle.workflow.id, bundle.workflow.user_id, bundle.workflow.cost_estimate, bundle.workflow.cost_reserved, bundle.steps);
    return;
  }

  if (runnable.length && completed.length === runnable.length) {
    const finalOutputs = collectFinalOutputs(bundle.steps);
    const total = bundle.workflow.cost_estimate?.total || bundle.workflow.cost_reserved || 0;
    await settleWorkflowCredits(bundle.workflow.user_id, bundle.workflow.id, total);
    await setWorkflowStatus(bundle.workflow.id, "completed", {
      final_outputs: finalOutputs,
      cost_settled: total,
    });
    await appendWorkflowEvent({
      workflowId: bundle.workflow.id,
      type: "workflow_completed",
      message: "Workflow completed",
      payload: { finalOutputs },
    });
  }
}

async function finalizeFailedWorkflow(
  workflowId: string,
  userId: string,
  costEstimate: WorkflowCostEstimate | null,
  reserved: number,
  steps: WorkflowStepRecord[]
) {
  const settleAmount = estimateCompletedCost(costEstimate, steps.filter((step) => step.status === "completed").map((step) => step.step_key));
  const releaseAmount = Math.max(0, reserved - settleAmount);
  if (settleAmount > 0) await settleWorkflowCredits(userId, workflowId, settleAmount);
  if (releaseAmount > 0) await releaseWorkflowCredits(userId, workflowId, releaseAmount, `Agent workflow failed release (${workflowId})`);
  await setWorkflowStatus(workflowId, settleAmount > 0 ? "partially_completed" : "failed", {
    error_message: "Workflow failed after step error",
    cost_settled: settleAmount,
  });
  await appendWorkflowEvent({
    workflowId,
    type: settleAmount > 0 ? "workflow_partially_completed" : "workflow_failed",
    message: "Workflow stopped because a step failed",
    payload: { releaseAmount, settleAmount },
  });
}

function getReadySteps(steps: WorkflowStepRecord[]) {
  return steps.filter((step) => step.status === "ready");
}

function collectFinalOutputs(steps: WorkflowStepRecord[]): WorkflowStepResultOutput {
  const lastCompleted = [...steps].reverse().find((step) => step.status === "completed" && step.output);
  if (lastCompleted?.output) return lastCompleted.output;
  return {
    imageUrls: steps.flatMap((step) => step.output?.imageUrls || []),
  };
}

function estimateCompletedCost(costEstimate: WorkflowCostEstimate | null, completedStepIds: string[]) {
  if (!costEstimate) return 0;
  const completed = new Set(completedStepIds);
  return costEstimate.steps
    .filter((step) => completed.has(step.stepId))
    .reduce((sum, step) => sum + step.estimatedCredits, 0);
}
