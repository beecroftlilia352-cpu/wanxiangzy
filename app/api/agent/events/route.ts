import { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const conversationId = request.nextUrl.searchParams.get("conversationId");
  const encoder = new TextEncoder();
  let cursor = request.nextUrl.searchParams.get("cursor") || new Date(Date.now() - 30_000).toISOString();
  let closed = false;

  request.signal.addEventListener("abort", () => {
    closed = true;
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(`event: ready\ndata: ${JSON.stringify({ ok: true, cursor })}\n\n`));
      const heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(`event: ping\ndata: ${JSON.stringify({ ts: new Date().toISOString() })}\n\n`));
      }, 15_000);

      try {
        const deadline = Date.now() + 55_000;
        while (!closed && Date.now() < deadline) {
          const batch = await loadAgentEvents({
            supabase: auth.supabase,
            userId: auth.user.id,
            conversationId,
            cursor,
          });
          for (const event of batch.events) {
            controller.enqueue(encoder.encode(`event: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`));
          }
          if (batch.nextCursor) cursor = batch.nextCursor;
          await sleep(1800);
        }
      } catch (err) {
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: err instanceof Error ? err.message : "event stream failed" })}\n\n`));
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

async function loadAgentEvents(params: {
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createServerSupabase>>;
  userId: string;
  conversationId?: string | null;
  cursor: string;
}) {
  const events: Array<Record<string, unknown> & { kind: string; created_at: string }> = [];

  let metricQuery = params.supabase
    .from("agent_observability_events")
    .select("id,event,route,ok,latency_ms,confidence,module,action,metadata,created_at")
    .eq("user_id", params.userId)
    .gt("created_at", params.cursor)
    .order("created_at", { ascending: true })
    .limit(20);
  if (params.conversationId) metricQuery = metricQuery.eq("conversation_id", params.conversationId);
  const metrics = await metricQuery;
  for (const row of metrics.data || []) events.push({ kind: "agent_metric", ...row });

  let traceQuery = params.supabase
    .from("agent_brain_traces")
    .select("id,conversation_id,message_excerpt,action,module,confidence,source,trace,created_at")
    .eq("user_id", params.userId)
    .gt("created_at", params.cursor)
    .order("created_at", { ascending: true })
    .limit(20);
  if (params.conversationId) traceQuery = traceQuery.eq("conversation_id", params.conversationId);
  const traces = await traceQuery;
  for (const row of traces.data || []) events.push({ kind: "brain_trace", ...row });

  if (params.conversationId) {
    const workflows = await params.supabase
      .from("agent_workflows")
      .select("id")
      .eq("user_id", params.userId)
      .eq("conversation_id", params.conversationId)
      .limit(20);
    const workflowIds = (workflows.data || []).map((row) => row.id).filter(Boolean);
    if (workflowIds.length) {
      const workflowEvents = await params.supabase
        .from("agent_workflow_events")
        .select("id,workflow_id,step_id,type,message,payload,created_at")
        .in("workflow_id", workflowIds)
        .gt("created_at", params.cursor)
        .order("created_at", { ascending: true })
        .limit(40);
      for (const row of workflowEvents.data || []) events.push({ kind: "workflow_event", ...row });
    }
  }

  events.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  return {
    events,
    nextCursor: events.length ? events[events.length - 1].created_at : null,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
