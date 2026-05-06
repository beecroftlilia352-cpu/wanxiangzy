import { getCreditCost, normalizeAspectRatio, normalizeImageSize, normalizeLingyaModel, type ImageSize } from "@/lib/api/lingya";
import { getWorkflowTool } from "@/lib/agent/workflow/tools";
import type { GenerationDefaults, WorkflowCostEstimate, WorkflowPlan } from "@/lib/agent/workflow/types";

export function estimateWorkflowCost(plan: WorkflowPlan, defaults: GenerationDefaults): WorkflowCostEstimate {
  const steps = plan.steps.map((step) => {
    const tool = getWorkflowTool(step.type);
    if (!tool || tool.costPolicy.free) {
      return {
        stepId: step.id,
        toolType: step.type,
        estimatedCredits: 0,
        reason: tool?.title ? `${tool.title} 免费辅助步骤` : "未知免费辅助步骤",
      };
    }

    const model = normalizeLingyaModel(step.params.model || step.params.aiModel || step.params.ai_model || defaults.model);
    const aspectRatio = normalizeAspectRatio(step.params.aspectRatio || step.params.aspect_ratio || defaults.aspectRatio);
    const imageSize = normalizeImageSize(model, String(step.params.imageSize || step.params.image_size || defaults.imageSize) as ImageSize, aspectRatio);
    const count = getBillableImageCount(step, defaults.count);
    const unit = Math.max(tool.costPolicy.baseCredits, getCreditCost(model, imageSize, aspectRatio));
    const billPerImage = tool.costPolicy.perImage !== false || shouldBillPerOutputImage(step);
    const estimatedCredits = billPerImage ? unit * count : unit;

    return {
      stepId: step.id,
      toolType: step.type,
      estimatedCredits,
      reason: `${tool.title} (${model}, ${imageSize}) x ${billPerImage ? count : 1}`,
    };
  });
  const total = steps.reduce((sum, step) => sum + step.estimatedCredits, 0);
  return {
    total,
    reserve: total,
    currency: "credits",
    steps,
  };
}

function getBillableImageCount(step: WorkflowPlan["steps"][number], defaultCount: number) {
  if (step.type === "commerce_detail_section") return 1;
  if (step.type === "commerce_detail_stitch") return 1;
  if (step.type === "tryon") return normalizeCount(step.params.count ?? step.params.genCount ?? 1);
  if (step.type === "pose_variation") {
    const mode = String(step.params.outputMode || step.params.output_mode || "").toLowerCase();
    const count = normalizeCount(step.params.count ?? step.params.genCount ?? defaultCount);
    return mode === "grid" ? 1 : count;
  }
  return normalizeCount(step.params.count ?? step.params.genCount ?? defaultCount);
}

function shouldBillPerOutputImage(step: WorkflowPlan["steps"][number]) {
  if (step.type !== "pose_variation") return false;
  const mode = String(step.params.outputMode || step.params.output_mode || "").toLowerCase();
  return mode !== "grid";
}

function normalizeCount(value: unknown) {
  const num = Number(value || 1);
  if (!Number.isFinite(num)) return 1;
  return Math.min(Math.max(Math.floor(num), 1), 4);
}
