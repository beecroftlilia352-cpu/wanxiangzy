import type {
  GenerationDefaults,
  PlanValidationResult,
  WorkflowInputImage,
  WorkflowPlan,
  WorkflowStepPlan,
} from "@/lib/agent/workflow/types";
import type { AgentBrainTrace } from "@/lib/agent/brain/types";
import { addTraceEvent } from "@/lib/agent/brain/trace";

export type WorkflowPlanCritique = {
  ok: boolean;
  score: number;
  issues: Array<{ code: string; message: string; severity: "error" | "warning" }>;
  repairedPlan?: WorkflowPlan;
  clarificationQuestion?: string;
};

export async function critiqueWorkflowPlan(params: {
  userText: string;
  images: WorkflowInputImage[];
  defaults: GenerationDefaults;
  plan: WorkflowPlan;
  validation?: PlanValidationResult;
  trace?: AgentBrainTrace;
}): Promise<WorkflowPlanCritique> {
  const issues: WorkflowPlanCritique["issues"] = [];
  let repairedPlan: WorkflowPlan | undefined;
  let score = params.plan.confidence || 0.65;
  const text = params.userText;
  const plan = clonePlan(params.plan);

  if (!plan.needsClarification && plan.steps.length === 0) {
    issues.push({ code: "NO_EXECUTABLE_STEPS", message: "Planner 没有生成可执行步骤。", severity: "error" });
    score -= 0.3;
  }

  if (isCommerceDetailText(text) && !plan.steps.some((step) => step.type === "commerce_detail")) {
    const wrongGrass = plan.steps.some((step) => step.type === "commerce_creative" || step.type === "tryon");
    issues.push({
      code: "COMMERCE_DETAIL_MISROUTE",
      message: wrongGrass ? "详情页任务被规划成了其它商业图/专项图。" : "详情页任务缺少 commerce_detail 步骤。",
      severity: "warning",
    });
    repairedPlan = {
      ...plan,
      intent: "commerce_detail",
      summary: "生成电商详情页",
      confidence: Math.max(plan.confidence, 0.86),
      needsClarification: false,
      clarificationQuestion: undefined,
      steps: [{
        id: "step_1",
        type: "commerce_detail",
        title: "电商详情页",
        dependsOn: [],
        input: { referenceImages: params.images.map((img) => `图${img.index}`) },
        params: { prompt: text, count: params.defaults.count },
        expectedOutput: { imageUrls: true },
        riskNotes: ["需要检查是否生成详情页分区，而不是单张氛围图或种草图。"],
      }],
    };
    score = Math.max(score, 0.86);
  }

  const poseStep = (repairedPlan || plan).steps.find((step) => step.type === "pose_variation");
  if (poseStep && /每张|单独|独立/.test(text) && poseStep.params.outputMode !== "separate") {
    issues.push({ code: "POSE_OUTPUT_MODE_REPAIRED", message: "用户要求每张单独出图，已修正姿势裂变输出模式。", severity: "warning" });
    const base = repairedPlan || plan;
    repairedPlan = {
      ...base,
      steps: base.steps.map((step) =>
        step.id === poseStep.id
          ? { ...step, params: { ...step.params, outputMode: "separate" } }
          : step
      ),
    };
  }

  if (/视频|短片|动起来|走秀|运镜/.test(text)) {
    issues.push({ code: "VIDEO_RESERVED", message: "视频能力当前仅预留，不能创建可执行视频步骤。", severity: "error" });
    const base = repairedPlan || plan;
    repairedPlan = {
      ...base,
      needsClarification: true,
      clarificationQuestion: "视频能力还没有开启。我可以先帮你生成关键帧图片，是否继续？",
      steps: base.steps.filter((step) => step.type !== "image_to_video"),
    };
    score = Math.min(score, 0.55);
  }

  if (params.validation && !params.validation.ok) {
    for (const error of params.validation.errors) {
      issues.push({ code: error.code, message: error.message, severity: "error" });
    }
    score = Math.min(score, 0.6);
  }

  const finalPlan = repairedPlan || plan;
  const ok = !finalPlan.needsClarification && issues.every((issue) => issue.severity !== "error");
  if (params.trace) {
    addTraceEvent(params.trace, {
      stage: "workflow_critic",
      status: ok ? "ok" : "warn",
      summary: issues.length ? issues.map((issue) => issue.message).join("；") : "Workflow plan passed critic checks.",
      data: { score, issueCodes: issues.map((issue) => issue.code), repaired: Boolean(repairedPlan) },
    });
  }

  return {
    ok,
    score: Math.max(0, Math.min(0.98, score)),
    issues,
    repairedPlan,
    clarificationQuestion: finalPlan.clarificationQuestion,
  };
}

function clonePlan(plan: WorkflowPlan): WorkflowPlan {
  return {
    ...plan,
    imageRoles: plan.imageRoles.map((role) => ({ ...role })),
    userConstraints: [...plan.userConstraints],
    assumptions: [...plan.assumptions],
    steps: plan.steps.map(cloneStep),
  };
}

function cloneStep(step: WorkflowStepPlan): WorkflowStepPlan {
  return {
    ...step,
    dependsOn: [...step.dependsOn],
    input: { ...step.input },
    params: { ...step.params },
    expectedOutput: { ...step.expectedOutput },
    riskNotes: step.riskNotes ? [...step.riskNotes] : undefined,
  };
}

function isCommerceDetailText(text: string) {
  return /详情页|长图|卖点图|参数图|功能图|淘宝|天猫|京东|店铺详情|商品详情/.test(text);
}

