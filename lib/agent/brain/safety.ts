import { getForbiddenAgentModules } from "@/lib/agent/visual-task-planner";
import type { AgentBrainDecision, AgentBrainRequest } from "@/lib/agent/brain/types";
import { addTraceEvent, finalizeBrainTrace } from "@/lib/agent/brain/trace";
import { parseTryonRefs } from "@/lib/agent/brain/semantic-router";

const MIN_GENERATION_CONFIDENCE = 0.64;

export function applyDeterministicSafetyGuard(
  decision: AgentBrainDecision,
  request: AgentBrainRequest
): AgentBrainDecision {
  const next: AgentBrainDecision = {
    ...decision,
    params: { ...decision.params },
    safety: {
      allowed: true,
      requiresClarification: decision.action === "clarify",
      reasons: [...decision.safety.reasons],
      blockedModules: [...decision.safety.blockedModules],
    },
  };
  const text = request.userText.trim();
  const hasImages = request.images.length > 0;

  if (request.intentMode === "chat") {
    next.action = "chat";
    next.module = null;
    next.visualTaskPlan = null;
    next.safety.reasons.push("用户选择 Chat 模式，禁止创建生成任务。");
  }

  if (/视频|短片|动起来|走秀|运镜|镜头运动/.test(text)) {
    next.action = "clarify";
    next.module = null;
    next.safety.allowed = false;
    next.safety.requiresClarification = true;
    next.safety.blockedModules.push("image_to_video");
    next.reply = "视频能力已经在架构里预留，但当前生产环境还没有开启。我可以先帮你生成关键帧图片，后续再接入图生视频。";
  }

  const tryonRefs = parseTryonRefs(text);
  if (tryonRefs && request.intentMode !== "chat") {
    next.action = "generate";
    next.module = "tryon";
    next.params.clothing_urls = [tryonRefs.clothingRef];
    next.params.reference_url = tryonRefs.personRef;
    next.confidence = Math.max(next.confidence, 0.88);
    next.safety.reasons.push("识别到明确图号换装关系，按图号锁定服装图和人物图。");
  }

  if (isCommerceDetailText(text) && request.intentMode !== "chat") {
    next.action = "generate";
    next.module = "general";
    next.visualTaskPlan = {
      module: "general",
      label: "淘宝详情页",
      taskType: "commerce_detail",
      preferredAspectRatio: "3:4",
      prompt: [
        "生成一张电商详情页长图视觉，必须包含首屏主视觉、核心卖点区、细节展示区、参数/功能信息区和清晰的版式层级。",
        "不要做成小红书种草图、街拍图或普通氛围照片。",
        `用户原始需求：${text}`,
      ].join("\n"),
      useImages: hasImages,
      confidence: Math.max(next.confidence, 0.88),
    };
    next.params.prompt = next.visualTaskPlan.prompt;
    next.confidence = Math.max(next.confidence, 0.88);
    next.safety.reasons.push("电商详情页意图优先级高于种草/街拍，强制走通用详情页生成。");
  }

  if (next.module) {
    const forbidden = getForbiddenAgentModules(text);
    if (forbidden.includes(next.module as never)) {
      next.safety.blockedModules.push(next.module);
      if (/生成|制作|出图|设计|重做|改成/.test(text)) {
        next.module = "general";
        next.safety.reasons.push("用户排除了专项模块，降级为通用生成。");
      } else {
        next.action = "clarify";
        next.module = null;
        next.safety.requiresClarification = true;
        next.reply = "我不想误用你排除的流程。你希望我改成通用图生图，还是只先分析建议？";
      }
    }
  }

  if (next.action === "generate" && moduleNeedsImage(next.module) && !hasImages) {
    next.action = "clarify";
    next.module = null;
    next.safety.requiresClarification = true;
    next.missingFields = Array.from(new Set([...next.missingFields, "reference_image"]));
    next.reply = "这个任务需要参考图。请先上传服装、人物或商品图，或者改成纯文生图描述。";
  }

  if (next.action === "generate" && !next.module) {
    next.action = "clarify";
    next.safety.requiresClarification = true;
    next.reply = buildLowConfidenceQuestion(text, hasImages);
    next.safety.reasons.push("Router 要求生成但没有给出可执行模块，必须追问。");
  }

  if (next.action === "generate" && next.confidence < MIN_GENERATION_CONFIDENCE) {
    next.action = "clarify";
    next.module = null;
    next.safety.requiresClarification = true;
    next.reply = buildLowConfidenceQuestion(text, hasImages);
    next.safety.reasons.push(`生成置信度 ${next.confidence.toFixed(2)} 低于阈值，必须追问。`);
  }

  if (next.action === "clarify") {
    next.module = null;
    next.safety.requiresClarification = true;
    next.confidence = Math.min(next.confidence, 0.63);
  }

  const trace = requestTrace(decision);
  addTraceEvent(trace, {
    stage: "deterministic_safety_guard",
    status: next.safety.requiresClarification ? "warn" : "ok",
    summary: next.safety.reasons.length ? next.safety.reasons.join("；") : "Safety guard passed.",
    data: {
      action: next.action,
      module: next.module,
      confidence: next.confidence,
      missingFields: next.missingFields,
      blockedModules: next.safety.blockedModules,
    },
  });
  next.trace = finalizeBrainTrace(trace, next);
  return next;
}

function requestTrace(decision: AgentBrainDecision) {
  return decision.trace.id === "pending"
    ? { ...decision.trace, id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}` }
    : decision.trace;
}

function isCommerceDetailText(text: string) {
  return /详情页|长图|卖点图|参数图|功能图|淘宝|天猫|京东|店铺详情|商品详情/.test(text);
}

function moduleNeedsImage(module: AgentBrainDecision["module"]) {
  return module === "tryon" || module === "grass" || module === "garment_3d" || module === "model" || module === "model_background" || module === "pose";
}

function buildLowConfidenceQuestion(text: string, hasImages: boolean) {
  if (hasImages) {
    return "我需要先确认一下图片关系，避免生成错方向。你希望我对这些图做哪一种操作：分析、换装、详情页、姿势裂变，还是通用图生图？";
  }
  if (text) return "我还没完全确定你要聊天咨询还是生成图片。你是想让我直接出图，还是先给你方案建议？";
  return "你想让我先分析图片，还是直接创建一个生成任务？";
}
