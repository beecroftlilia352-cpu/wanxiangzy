import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { executeAiRouted } = vi.hoisted(() => ({ executeAiRouted: vi.fn() }));
vi.mock("@/lib/ai-control-plane/router.server", () => ({ executeAiRouted }));

import { executeLlmChatRouted } from "@/lib/api/llm-routing.server";

const deployment = {
  id: "vision-primary",
  modelId: "vision-default",
  providerId: "gateway-a",
  upstreamModel: "vision-v2",
  protocol: "openai-chat" as const,
  enabled: true,
  priority: 10,
  weight: 100,
  maxConcurrency: 16,
  requestsPerMinute: 240,
  burst: 16,
  provider: { id: "gateway-a", name: "Gateway A", baseUrl: "https://llm.example/v1", enabled: true, timeoutMs: 30_000 },
  apiKey: "secret",
  health: { deploymentId: "vision-primary", circuitState: "closed" as const, consecutiveFailures: 0, sampleCount: 1, ewmaSuccessRate: 1, ewmaLatencyMs: 100 },
  score: 1,
  selectionReason: {},
};

describe("unified LLM chat routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executeAiRouted.mockImplementation(async (input) => input.execute(deployment, 1));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: "vision-v2",
      choices: [{ message: { content: "ok" } }],
      usage: { prompt_tokens: 11, completion_tokens: 7 },
    }), { status: 200 })));
  });

  afterEach(() => vi.unstubAllGlobals());

  it("selects the logical modality and sends through the chosen deployment", async () => {
    const completion = await executeLlmChatRouted({
      kind: "vision",
      context: { userId: "00000000-0000-4000-8000-000000000001" },
      body: { messages: [{ role: "user", content: "describe image" }], max_tokens: 100 },
    });

    expect(executeAiRouted).toHaveBeenCalledWith(expect.objectContaining({
      modelId: "vision-default",
      modality: "vision",
      context: expect.objectContaining({ userId: "00000000-0000-4000-8000-000000000001" }),
    }));
    expect(fetch).toHaveBeenCalledWith("https://llm.example/v1/chat/completions", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer secret" }),
    }));
    expect(JSON.parse(String((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body))).toMatchObject({ model: "vision-v2" });
    expect(completion).toMatchObject({ providerId: "gateway-a", deploymentId: "vision-primary", upstreamModel: "vision-v2" });
  });
});
