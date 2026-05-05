import { getAdminClient } from "@/lib/supabase/admin";

type AgentMetricEvent = {
  userId?: string | null;
  conversationId?: string | null;
  traceId?: string | null;
  event: string;
  route?: string;
  ok?: boolean;
  latencyMs?: number;
  confidence?: number;
  module?: string | null;
  action?: string | null;
  metadata?: Record<string, unknown>;
};

export async function recordAgentMetric(metric: AgentMetricEvent) {
  const payload = {
    level: metric.ok === false ? "warn" : "info",
    msg: "agent_metric",
    event: metric.event,
    route: metric.route,
    ok: metric.ok,
    latency_ms: metric.latencyMs,
    trace_id: metric.traceId,
    action: metric.action,
    module: metric.module,
    confidence: metric.confidence,
  };
  console.log(JSON.stringify(payload));

  try {
    const { error } = await getAdminClient()
      .from("agent_observability_events")
      .insert({
        user_id: metric.userId || null,
        conversation_id: metric.conversationId || null,
        trace_id: metric.traceId || null,
        event: metric.event,
        route: metric.route || null,
        ok: metric.ok ?? true,
        latency_ms: metric.latencyMs ?? null,
        confidence: metric.confidence ?? null,
        module: metric.module || null,
        action: metric.action || null,
        metadata: metric.metadata || {},
      });
    if (error) throw error;
  } catch (err) {
    console.warn("[agent-metrics] write skipped:", err instanceof Error ? err.message : String(err));
  }
}
