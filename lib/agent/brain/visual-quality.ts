import { callBrainJson } from "@/lib/agent/brain/llm-json";
import { createBrainTrace } from "@/lib/agent/brain/trace";
import type { AgentBrainTrace } from "@/lib/agent/brain/types";
import { checkImageOutputs } from "@/lib/agent/workflow/quality";

export type VisualQualityEvaluation = {
  ok: boolean;
  score: number;
  shouldRegenerate: boolean;
  summary: string;
  issues: string[];
  repairPrompt?: string;
  source: "vision_llm" | "deterministic";
  trace?: AgentBrainTrace;
};

export async function evaluateGeneratedImages(params: {
  userPrompt: string;
  module: string;
  resultUrls: string[];
  expectedCount: number;
  referenceImageUrls?: string[];
}): Promise<VisualQualityEvaluation> {
  const deterministic = await checkImageOutputs(params.resultUrls, params.expectedCount);
  if (!deterministic.ok) {
    return {
      ok: false,
      score: deterministic.score,
      shouldRegenerate: true,
      summary: "基础图片输出检查未通过。",
      issues: deterministic.checks.filter((check) => check.status === "fail").map((check) => check.detail),
      repairPrompt: "重新生成，确保返回有效、可访问、数量正确的图片结果。",
      source: "deterministic",
    };
  }

  const trace = createBrainTrace();
  const parsed = await callBrainJson({
    kind: "vision",
    stage: "visual_quality_evaluator",
    trace,
    temperature: 0.05,
    maxTokens: 900,
    system: [
      "You are a production visual quality evaluator for AI-generated ecommerce/fashion images.",
      "Return ONLY JSON. No markdown.",
      "Judge whether the generated images satisfy the user's prompt, module purpose, count, identity/garment consistency, commercial usefulness, and obvious visual defects.",
      "Do not be overly harsh about subjective style, but be strict about wrong task type, missing output count, malformed body/face/hands, unreadable ecommerce layout, or broken identity/clothing preservation.",
      "For tryon tasks, fail the result if any candidate switches to a different model/person, different ethnicity/body type, different studio/background/floor, different pose family, different camera distance/crop/framing, or visibly wrong head-to-body ratio compared with the target/reference image.",
      "For tryon batches, one chaotic outlier is enough to mark shouldRegenerate=true; do not average it away just because other candidates look acceptable.",
    ].join("\n"),
    text: [
      "Output schema:",
      JSON.stringify({
        ok: true,
        score: 0.0,
        summary: "short Chinese summary",
        issues: ["string"],
        shouldRegenerate: false,
        repairPrompt: "Chinese repair prompt if regeneration is needed",
      }),
      "",
      `Module: ${params.module}`,
      `Expected image count: ${params.expectedCount}`,
      `User prompt: ${params.userPrompt}`,
      params.referenceImageUrls?.length ? `Reference images count: ${params.referenceImageUrls.length}` : "",
      "Evaluate generated images attached after the references. If both references and outputs are present, compare consistency.",
    ].filter(Boolean).join("\n"),
    images: [...(params.referenceImageUrls || []), ...params.resultUrls].slice(0, 10),
    timeoutMs: 45_000,
  }).catch(() => null);

  if (!parsed) {
    return {
      ok: deterministic.ok,
      score: deterministic.score,
      shouldRegenerate: deterministic.score < 0.7,
      summary: "视觉 LLM 评估不可用，已使用基础质量检查。",
      issues: deterministic.checks.filter((check) => check.status !== "pass").map((check) => check.detail),
      source: "deterministic",
      trace,
    };
  }

  const score = clampScore(parsed.score);
  const issues = Array.isArray(parsed.issues)
    ? parsed.issues.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 8)
    : [];
  const shouldRegenerate = Boolean(parsed.shouldRegenerate) || score < getQualityThreshold(params.module);

  return {
    ok: Boolean(parsed.ok) && !shouldRegenerate && score >= getQualityThreshold(params.module),
    score,
    shouldRegenerate,
    summary: typeof parsed.summary === "string" ? parsed.summary : "视觉质量评估完成。",
    issues,
    repairPrompt: typeof parsed.repairPrompt === "string" && parsed.repairPrompt.trim() ? parsed.repairPrompt.trim() : buildDefaultRepairPrompt(params.module, issues),
    source: "vision_llm",
    trace,
  };
}

export function applyQualityRepairToPrompt(prompt: string, quality: VisualQualityEvaluation) {
  const lines = [
    prompt.trim(),
    "",
    "自动质量复盘修复：",
    quality.summary,
    quality.issues.length ? `问题：${quality.issues.join("；")}` : "",
    quality.repairPrompt ? `重生要求：${quality.repairPrompt}` : "",
    "保持用户原始目标，不要切换任务类型；优先修复上述问题。",
  ].filter(Boolean);
  return lines.join("\n");
}

export function getQualityThreshold(module: string) {
  if (module === "tryon" || module === "pose") return 0.78;
  if (module === "commerce_detail") return 0.76;
  return 0.72;
}

function buildDefaultRepairPrompt(module: string, issues: string[]) {
  if (module === "tryon") return "重新生成，重点保持同一固定底图、同一人物身份、同一镜头画幅、同一背景地面、同一头身比例、同一姿势范围，并排除任何乱入候选。";
  if (module === "pose") return "重新生成，重点保持身体比例、脸部一致、自然关节和用户指定输出形式。";
  if (module === "commerce_detail") return "重新生成，必须是清晰的电商详情页版式，包含首屏、卖点、细节和参数信息区。";
  return issues.length ? `重新生成并修复：${issues.join("；")}` : "重新生成并提升商业可用性、主体清晰度和画面稳定性。";
}

function clampScore(value: unknown) {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return 0.7;
  return Math.max(0, Math.min(1, num > 1 ? num / 100 : num));
}
