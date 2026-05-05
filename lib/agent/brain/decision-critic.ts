import type { AgentBrainDecision, AgentBrainRequest, AgentBrainTrace } from "@/lib/agent/brain/types";
import type { CandidateWorkflowTool } from "@/lib/agent/brain/tool-selector";
import { addTraceEvent } from "@/lib/agent/brain/trace";

export function critiqueBrainDecision(params: {
  request: AgentBrainRequest;
  decision: AgentBrainDecision;
  candidateTools: CandidateWorkflowTool[];
  trace: AgentBrainTrace;
}): AgentBrainDecision {
  const text = params.request.userText;
  const candidates = params.candidateTools;
  let next = params.decision;
  const findings: string[] = [];

  const topDisabled = candidates.find((tool) => !tool.enabled && tool.score >= 0.7);
  if (topDisabled && next.action === "generate") {
    next = {
      ...next,
      action: "clarify",
      module: null,
      reply: `${topDisabled.title} 已在架构里预留，但当前生产环境还没有开启。我可以先帮你生成静态图片方案，或等该能力上线后再执行。`,
      confidence: Math.max(next.confidence, 0.82),
      missingFields: ["reserved_capability"],
      safety: {
        ...next.safety,
        requiresClarification: true,
        reasons: [...next.safety.reasons, `${topDisabled.type} is reserved but disabled`],
      },
    };
    findings.push(`disabled tool ${topDisabled.type} requested`);
  }

  if (/详情页|长图|卖点图|参数图|淘宝|天猫|京东/.test(text) && next.action === "generate" && next.module === "grass") {
    next = {
      ...next,
      module: "general",
      visualTaskPlan: {
        module: "general",
        label: "淘宝详情页",
        taskType: "commerce_detail",
        preferredAspectRatio: "3:4",
        prompt: `生成电商详情页长图，包含首屏主视觉、卖点区、细节区和参数区。用户原始需求：${text}`,
        useImages: params.request.images.length > 0,
        confidence: Math.max(next.confidence, 0.88),
      },
      params: {
        ...next.params,
        prompt: `生成电商详情页长图，包含首屏主视觉、卖点区、细节区和参数区。用户原始需求：${text}`,
      },
      confidence: Math.max(next.confidence, 0.88),
    };
    findings.push("corrected grass to commerce_detail");
  }

  if (next.action === "generate" && next.confidence < 0.58) {
    next = {
      ...next,
      action: "clarify",
      module: null,
      reply: "我还不能稳定判断你的目标。请补一句你最终想要的输出类型，例如详情页、主图、换装、姿势变化、3D 展示或普通图生图。",
      missingFields: ["visual_goal"],
      safety: { ...next.safety, requiresClarification: true },
    };
    findings.push("low confidence generation converted to clarification");
  }

  addTraceEvent(params.trace, {
    stage: "decision_critic",
    status: findings.length ? "warn" : "ok",
    summary: findings.length ? "Decision critic repaired the routed decision." : "Decision critic accepted the routed decision.",
    data: { findings, action: next.action, module: next.module, confidence: next.confidence },
  });

  return next;
}
