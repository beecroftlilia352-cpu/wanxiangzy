import { getWorkflowTool } from "@/lib/agent/workflow/tools";
import { getWorkflowModelCapability, supportsRequiredCapabilities } from "@/lib/agent/workflow/model-capabilities";
import { repairWorkflowPlan } from "@/lib/agent/workflow/repair";
import type {
  GenerationDefaults,
  PlanValidationIssue,
  PlanValidationResult,
  WorkflowInputImage,
  WorkflowPlan,
  WorkflowStepPlan,
} from "@/lib/agent/workflow/types";

const MAX_STEPS = 8;
const MAX_COST = 40;

export function validateWorkflowPlan(params: {
  plan: WorkflowPlan;
  images: WorkflowInputImage[];
  defaults: GenerationDefaults;
  maxCost?: number;
}): PlanValidationResult {
  const repaired = repairWorkflowPlan(params.plan);
  const plan = repaired.plan;
  const errors: PlanValidationIssue[] = [];
  const warnings: PlanValidationIssue[] = repaired.notes.map((message) => ({
    code: "PLAN_REPAIRED",
    message,
    severity: "warning",
  }));
  const blockedStepIds: string[] = [];

  if (plan.needsClarification) {
    return {
      ok: false,
      repairedPlan: plan,
      errors: [{
        code: "NEEDS_CLARIFICATION",
        message: plan.clarificationQuestion || "需要补充任务信息",
        severity: "error",
      }],
      warnings,
      clarificationQuestion: plan.clarificationQuestion,
      blockedStepIds,
    };
  }

  if (!plan.steps.length) {
    errors.push({ code: "NO_STEPS", message: "计划里没有可执行步骤。", severity: "error" });
  }

  if (plan.steps.length > MAX_STEPS) {
    errors.push({ code: "TOO_MANY_STEPS", message: `单个工作流最多 ${MAX_STEPS} 步。`, severity: "error" });
  }

  const ids = new Set(plan.steps.map((step) => step.id));
  const capability = getWorkflowModelCapability(params.defaults.model, params.defaults.aspectRatio);

  for (const step of plan.steps) {
    const tool = getWorkflowTool(step.type);
    if (!tool) {
      errors.push(issue("UNKNOWN_TOOL", `未知工具：${step.type}`, step));
      blockedStepIds.push(step.id);
      continue;
    }
    if (!tool.enabled) {
      errors.push(issue("TOOL_DISABLED", `${tool.title} 当前未开启。`, step));
      blockedStepIds.push(step.id);
      continue;
    }
    const modelCheck = supportsRequiredCapabilities(capability, tool.requiredCapabilities);
    if (!modelCheck.ok) {
      errors.push(issue("MODEL_CAPABILITY_MISSING", `${capability.model} 不支持：${modelCheck.missing.join(", ")}`, step));
      blockedStepIds.push(step.id);
    }
    for (const dep of step.dependsOn) {
      if (!ids.has(dep)) {
        errors.push(issue("MISSING_DEPENDENCY", `${step.title} 依赖不存在的步骤 ${dep}`, step));
      }
    }
    validateStepInputs(step, params.images, errors, warnings);
    validateNegativeConstraints(step, plan.userConstraints, errors);
  }

  if (hasCycle(plan.steps)) {
    errors.push({ code: "DEPENDENCY_CYCLE", message: "步骤依赖存在循环。", severity: "error" });
  }

  const estimatedMax = plan.steps.reduce((sum, step) => sum + (getWorkflowTool(step.type)?.costPolicy.baseCredits || 0), 0);
  if (estimatedMax > (params.maxCost || MAX_COST)) {
    errors.push({ code: "COST_LIMIT", message: `任务预计成本过高，已超过上限 ${(params.maxCost || MAX_COST)}。`, severity: "error" });
  }

  return {
    ok: errors.length === 0,
    repairedPlan: plan,
    errors,
    warnings,
    clarificationQuestion: errors.find((item) => item.code === "NEEDS_CLARIFICATION")?.message,
    blockedStepIds: Array.from(new Set(blockedStepIds)),
  };
}

function validateStepInputs(
  step: WorkflowStepPlan,
  images: WorkflowInputImage[],
  errors: PlanValidationIssue[],
  warnings: PlanValidationIssue[]
) {
  const text = JSON.stringify(step.input);
  const hasImageRef = /图\s*\d|image:\d|\$step_/.test(text);
  const imageCount = images.length;
  if (["tryon", "pose_variation", "garment_3d", "image_to_image", "background_replace"].includes(step.type) && !hasImageRef && imageCount === 0) {
    errors.push(issue("MISSING_IMAGE_INPUT", `${step.title} 缺少必要图片输入。`, step));
  }
  if (step.type === "garment_3d" && /person|人物|模特|上身|穿着/.test(text)) {
    warnings.push(issue("GARMENT_3D_INPUT_RISK", "3D 展示更适合单品服装图，模特上身图存在结构还原风险。", step, "warning"));
  }
}

function validateNegativeConstraints(
  step: WorkflowStepPlan,
  constraints: string[],
  errors: PlanValidationIssue[]
) {
  const text = constraints.join("\n");
  if (!text) return;
  if (step.type === "tryon" && /不要.*(换装|上身|试穿)|不是.*(换装|上身|试穿)/.test(text)) {
    errors.push(issue("NEGATIVE_CONSTRAINT", "用户明确排除了换装流程。", step));
  }
  if (step.type === "pose_variation" && /不要.*(姿势|四宫格|pose)|不是.*(姿势|四宫格|pose)/i.test(text)) {
    errors.push(issue("NEGATIVE_CONSTRAINT", "用户明确排除了姿势裂变流程。", step));
  }
  if (step.type === "commerce_detail" && /不要.*详情页|不是.*详情页/.test(text)) {
    errors.push(issue("NEGATIVE_CONSTRAINT", "用户明确排除了详情页。", step));
  }
}

function hasCycle(steps: WorkflowStepPlan[]) {
  const graph = new Map(steps.map((step) => [step.id, step.dependsOn]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visited.has(id)) return false;
    if (visiting.has(id)) return true;
    visiting.add(id);
    for (const dep of graph.get(id) || []) {
      if (visit(dep)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return steps.some((step) => visit(step.id));
}

function issue(
  code: string,
  message: string,
  step: WorkflowStepPlan,
  severity: PlanValidationIssue["severity"] = "error"
): PlanValidationIssue {
  return { code, message, stepId: step.id, severity };
}
