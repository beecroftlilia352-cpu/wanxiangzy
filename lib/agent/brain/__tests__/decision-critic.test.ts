import { describe, expect, it } from "vitest";
import { createBrainTrace } from "@/lib/agent/brain/trace";
import { critiqueBrainDecision } from "@/lib/agent/brain/decision-critic";
import type { AgentBrainDecision } from "@/lib/agent/brain/types";

const baseDecision: AgentBrainDecision = {
  action: "generate",
  reply: "ok",
  module: "grass",
  params: {},
  style: null,
  confidence: 0.8,
  missingFields: [],
  source: "llm",
  visualTaskPlan: null,
  imageUnderstanding: null,
  safety: { allowed: true, requiresClarification: false, reasons: [], blockedModules: [] },
  trace: createBrainTrace(),
};

describe("decision critic", () => {
  it("repairs commerce detail requests that were routed to grass", () => {
    const trace = createBrainTrace();
    const decision = critiqueBrainDecision({
      trace,
      decision: baseDecision,
      candidateTools: [],
      request: {
        userText: "根据这张图生成淘宝详情页",
        images: [{ index: 1, url: "https://example.com/a.jpg", role: "source" }],
        intentMode: "smart",
      },
    });

    expect(decision.module).toBe("general");
    expect(decision.visualTaskPlan?.taskType).toBe("commerce_detail");
  });

  it("clarifies reserved disabled tool requests", () => {
    const trace = createBrainTrace();
    const decision = critiqueBrainDecision({
      trace,
      decision: { ...baseDecision, module: "general" },
      candidateTools: [{ type: "image_to_video", title: "图生视频", enabled: false, score: 0.9, reason: "video" }],
      request: {
        userText: "把图1做成走秀视频",
        images: [{ index: 1, url: "https://example.com/a.jpg", role: "source" }],
        intentMode: "smart",
      },
    });

    expect(decision.action).toBe("clarify");
    expect(decision.module).toBeNull();
  });
});
