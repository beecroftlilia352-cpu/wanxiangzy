import { v4 } from "@/lib/store/uuid";
import type { AgentBrainDecision, AgentBrainTrace, AgentBrainTraceEvent } from "@/lib/agent/brain/types";

export function createBrainTrace(): AgentBrainTrace {
  return {
    id: v4(),
    version: "agent-brain-v2",
    startedAt: new Date().toISOString(),
    events: [],
  };
}

export function addTraceEvent(trace: AgentBrainTrace, event: AgentBrainTraceEvent) {
  trace.events.push(event);
}

export function finalizeBrainTrace(trace: AgentBrainTrace, decision: Pick<AgentBrainDecision, "action" | "module" | "confidence" | "source">) {
  const finishedAt = new Date().toISOString();
  trace.final = {
    action: decision.action,
    module: decision.module,
    confidence: decision.confidence,
    source: decision.source,
  };
  trace.finishedAt = finishedAt;
  trace.latencyMs = Math.max(0, new Date(finishedAt).getTime() - new Date(trace.startedAt).getTime());
  return trace;
}

export async function saveAgentBrainTrace(params: {
  supabase: unknown;
  userId: string;
  conversationId?: string | null;
  message?: string;
  decision: AgentBrainDecision;
}) {
  try {
    const client = params.supabase as {
      from: (table: string) => {
        insert: (value: Record<string, unknown>) => PromiseLike<{ error: unknown }>;
      };
    };
    const payload = {
      id: params.decision.trace.id,
      user_id: params.userId,
      conversation_id: params.conversationId || null,
      message_excerpt: (params.message || "").slice(0, 240),
      action: params.decision.action,
      module: params.decision.module,
      confidence: params.decision.confidence,
      source: params.decision.source,
      trace: {
        ...params.decision.trace,
        events: params.decision.trace.events.map((event) => ({
          ...event,
          data: redactTraceData(event.data),
        })),
      },
    };
    const { error } = await client.from("agent_brain_traces").insert(payload);
    if (error) {
      console.warn("[agent-brain] trace save skipped:", error);
    }
  } catch (err) {
    console.warn("[agent-brain] trace save failed:", err instanceof Error ? err.message : String(err));
  }
}

function redactTraceData(data?: Record<string, unknown>) {
  if (!data) return undefined;
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (/url|image/i.test(key) && typeof value === "string") {
      output[key] = value.slice(0, 32) + "...";
    } else if (Array.isArray(value)) {
      output[key] = value.map((item) =>
        typeof item === "string" && /^https?:/.test(item) ? item.slice(0, 32) + "..." : item
      );
    } else {
      output[key] = value;
    }
  }
  return output;
}
