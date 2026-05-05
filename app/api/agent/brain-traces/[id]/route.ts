import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const limit = await checkRateLimit(`agent-brain-trace:${auth.user.id}`, 120, 60_000);
  if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "trace id required" }, { status: 400 });

  const { data, error } = await auth.supabase
    .from("agent_brain_traces")
    .select("*")
    .eq("user_id", auth.user.id)
    .eq("id", id)
    .single();

  if (error) {
    const status = error.code === "PGRST116" ? 404 : 503;
    return NextResponse.json({
      error: status === 404 ? "Trace not found" : "Brain trace table is not ready. Run supabase/agent-brain-traces.sql first.",
      detail: error.message,
    }, { status });
  }

  return NextResponse.json({ trace: data });
}

