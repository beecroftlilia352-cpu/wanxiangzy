import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const limit = await checkRateLimit(`agent-brain-traces:${auth.user.id}`, 60, 60_000);
  if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

  const { data, error } = await auth.supabase
    .from("agent_brain_traces")
    .select("id,conversation_id,message_excerpt,action,module,confidence,source,created_at")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({
      error: "Brain trace table is not ready. Run supabase/agent-brain-traces.sql first.",
      detail: error.message,
    }, { status: 503 });
  }

  return NextResponse.json({ traces: data || [] });
}

