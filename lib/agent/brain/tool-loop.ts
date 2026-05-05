import type { AgentBrainDecision, AgentBrainRequest } from "@/lib/agent/brain/types";
import { createBrainTrace, finalizeBrainTrace, addTraceEvent } from "@/lib/agent/brain/trace";
import { understandImages } from "@/lib/agent/brain/image-understanding";
import { selectCandidateTools } from "@/lib/agent/brain/tool-selector";
import { routeSemantically } from "@/lib/agent/brain/semantic-router";
import { applyDeterministicSafetyGuard } from "@/lib/agent/brain/safety";
import { critiqueBrainDecision } from "@/lib/agent/brain/decision-critic";

export async function runAgentBrainToolLoop(request: AgentBrainRequest): Promise<AgentBrainDecision> {
  const trace = createBrainTrace();
  if (request.featureFlags) trace.flags = request.featureFlags;
  addTraceEvent(trace, {
    stage: "agent_tool_loop",
    status: "ok",
    summary: "Agent loop started with tool budget: understand_images -> select_tools -> route -> safety -> critic.",
    data: { intentMode: request.intentMode, imageCount: request.images.length },
  });

  const imageUnderstanding = await runLoopTool(trace, "understand_images", () =>
    understandImages({ userText: request.userText, images: request.images, trace })
  );
  const candidateTools = await runLoopTool(trace, "select_candidate_tools", () =>
    selectCandidateTools({ request, imageUnderstanding, trace })
  );
  const routed = await runLoopTool(trace, "semantic_router", () =>
    routeSemantically({ request, imageUnderstanding, candidateTools, trace })
  );
  routed.trace = trace;
  const guarded = await runLoopTool(trace, "safety_guard", () =>
    applyDeterministicSafetyGuard(routed, request)
  );
  guarded.trace = trace;
  const critiqued = await runLoopTool(trace, "decision_critic", () =>
    critiqueBrainDecision({ request, decision: guarded, candidateTools, trace })
  );
  critiqued.trace = finalizeBrainTrace(trace, critiqued);
  return critiqued;
}

async function runLoopTool<T>(
  trace: ReturnType<typeof createBrainTrace>,
  name: string,
  fn: () => T | Promise<T>
): Promise<T> {
  const started = Date.now();
  addTraceEvent(trace, {
    stage: "tool_call",
    status: "ok",
    summary: `Calling tool: ${name}`,
    data: { tool: name },
  });
  try {
    const result = await fn();
    addTraceEvent(trace, {
      stage: "tool_result",
      status: "ok",
      summary: `Tool completed: ${name}`,
      latencyMs: Date.now() - started,
      data: { tool: name },
    });
    return result;
  } catch (err) {
    addTraceEvent(trace, {
      stage: "tool_result",
      status: "error",
      summary: `Tool failed: ${name}`,
      latencyMs: Date.now() - started,
      data: { tool: name, error: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }
}
