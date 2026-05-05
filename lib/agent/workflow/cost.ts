import { getCreditCost } from "@/lib/api/lingya";
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

    const count = normalizeCount(step.params.count ?? step.params.genCount ?? defaults.count);
    const unit = Math.max(tool.costPolicy.baseCredits, getCreditCost(defaults.model, defaults.imageSize, defaults.aspectRatio));
    const estimatedCredits = tool.costPolicy.perImage === false ? unit : unit * count;

    return {
      stepId: step.id,
      toolType: step.type,
      estimatedCredits,
      reason: `${tool.title} (${defaults.model}, ${defaults.imageSize}) x ${tool.costPolicy.perImage === false ? 1 : count}`,
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

function normalizeCount(value: unknown) {
  const num = Number(value || 1);
  if (!Number.isFinite(num)) return 1;
  return Math.min(Math.max(Math.floor(num), 1), 4);
}
