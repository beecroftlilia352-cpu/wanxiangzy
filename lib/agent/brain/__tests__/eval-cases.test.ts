import { describe, expect, it } from "vitest";
import { applyDeterministicSafetyGuard } from "@/lib/agent/brain/safety";
import { BRAIN_EVAL_CASES, evaluateBrainDecision } from "@/lib/agent/brain/eval-cases";
import type { AgentBrainDecision } from "@/lib/agent/brain/types";

function roughDecisionFor(testId: string): AgentBrainDecision {
  const base: AgentBrainDecision = {
    action: "chat",
    reply: "ok",
    module: null,
    params: {},
    style: null,
    confidence: testId === "ambiguous-image-request" ? 0.5 : 0.82,
    missingFields: [],
    source: "llm",
    visualTaskPlan: null,
    imageUnderstanding: null,
    safety: { allowed: true, requiresClarification: false, reasons: [], blockedModules: [] },
    trace: { id: "eval", version: "agent-brain-v2", startedAt: new Date().toISOString(), events: [] },
  };
  if (testId === "commerce-detail-not-grass") return { ...base, action: "generate", module: "grass", params: { garment_url: "图1" } };
  if (testId === "explicit-tryon-refs") return base;
  if (testId === "chat-mode-no-generation") return { ...base, action: "generate", module: "general", confidence: 0.9 };
  if (testId === "video-reserved") return { ...base, action: "generate", module: "general", confidence: 0.9 };
  if (testId === "ambiguous-image-request") return { ...base, action: "generate", module: "general" };
  return base;
}

describe("Brain eval safety baseline", () => {
  for (const testCase of BRAIN_EVAL_CASES) {
    it(testCase.title, () => {
      const guarded = applyDeterministicSafetyGuard(roughDecisionFor(testCase.id), testCase.request);
      const result = evaluateBrainDecision(guarded, testCase);
      expect(result.failures).toEqual([]);
      expect(result.ok).toBe(true);
    });
  }
});

