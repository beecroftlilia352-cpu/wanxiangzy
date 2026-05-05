import { describe, expect, it } from "vitest";
import { applyDeterministicSafetyGuard } from "@/lib/agent/brain/safety";
import type { AgentBrainDecision, AgentBrainRequest } from "@/lib/agent/brain/types";

function baseDecision(partial: Partial<AgentBrainDecision> = {}): AgentBrainDecision {
  return {
    action: "chat",
    reply: "ok",
    module: null,
    params: {},
    style: null,
    confidence: 0.8,
    missingFields: [],
    source: "llm",
    visualTaskPlan: null,
    imageUnderstanding: null,
    safety: { allowed: true, requiresClarification: false, reasons: [], blockedModules: [] },
    trace: { id: "test-trace", version: "agent-brain-v2", startedAt: new Date().toISOString(), events: [] },
    ...partial,
  };
}

function baseRequest(partial: Partial<AgentBrainRequest> = {}): AgentBrainRequest {
  return {
    userText: "",
    images: [],
    intentMode: "smart",
    ...partial,
  };
}

describe("Agent Brain v2 deterministic safety guard", () => {
  it("keeps Taobao detail page out of grass route", () => {
    const guarded = applyDeterministicSafetyGuard(
      baseDecision({ action: "generate", module: "grass", params: { garment_url: "图1" }, confidence: 0.8 }),
      baseRequest({ userText: "根据这张图生成淘宝详情页", images: [{ index: 1, url: "https://example.com/a.jpg", role: "source" }] })
    );

    expect(guarded.action).toBe("generate");
    expect(guarded.module).toBe("general");
    expect(guarded.visualTaskPlan?.taskType).toBe("commerce_detail");
    expect(String(guarded.params.prompt)).toContain("不要做成小红书种草图");
  });

  it("locks explicit try-on image refs", () => {
    const guarded = applyDeterministicSafetyGuard(
      baseDecision({ action: "chat", module: null, confidence: 0.5 }),
      baseRequest({
        userText: "图2人物穿图1衣服，然后生成4个不同姿势",
        images: [
          { index: 1, url: "https://example.com/clothing.jpg", role: "clothing" },
          { index: 2, url: "https://example.com/person.jpg", role: "reference" },
        ],
      })
    );

    expect(guarded.action).toBe("generate");
    expect(guarded.module).toBe("tryon");
    expect(guarded.params.clothing_urls).toEqual(["图1"]);
    expect(guarded.params.reference_url).toBe("图2");
  });

  it("forces chat mode to stay non-generative", () => {
    const guarded = applyDeterministicSafetyGuard(
      baseDecision({ action: "generate", module: "general", confidence: 0.9 }),
      baseRequest({ intentMode: "chat", userText: "生成一张图" })
    );

    expect(guarded.action).toBe("chat");
    expect(guarded.module).toBeNull();
  });

  it("asks before low-confidence generation", () => {
    const guarded = applyDeterministicSafetyGuard(
      baseDecision({ action: "generate", module: "general", confidence: 0.5 }),
      baseRequest({ userText: "搞一下", images: [{ index: 1, url: "https://example.com/a.jpg" }] })
    );

    expect(guarded.action).toBe("clarify");
    expect(guarded.safety.requiresClarification).toBe(true);
  });

  it("blocks video until worker capability is enabled", () => {
    const guarded = applyDeterministicSafetyGuard(
      baseDecision({ action: "generate", module: "general", confidence: 0.9 }),
      baseRequest({ userText: "把这张图做成走秀视频", images: [{ index: 1, url: "https://example.com/a.jpg" }] })
    );

    expect(guarded.action).toBe("clarify");
    expect(guarded.safety.blockedModules).toContain("image_to_video");
  });
});

