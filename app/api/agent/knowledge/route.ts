import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";
import { getAdminClient } from "@/lib/supabase/admin";
import { getAgentKnowledgeContext } from "@/lib/agent/brain/knowledge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const limit = await checkRateLimit(`agent-knowledge-list:${auth.user.id}`, 60, 60_000);
  if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

  const items = await getAgentKnowledgeContext({
    userId: auth.user.id,
    conversationId: request.nextUrl.searchParams.get("conversationId"),
    query: request.nextUrl.searchParams.get("q") || "",
    limit: Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit")) || 20, 1), 50),
  });
  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const limit = await checkRateLimit(`agent-knowledge-create:${auth.user.id}`, 30, 60_000);
  if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
  const content = typeof body.content === "string" ? body.content.trim().slice(0, 4000) : "";
  if (!title || !content) return NextResponse.json({ error: "title and content are required" }, { status: 400 });

  const scope = ["global", "brand", "project", "conversation"].includes(body.scope) ? body.scope : "project";
  const tags = Array.isArray(body.tags)
    ? body.tags.filter((tag: unknown): tag is string => typeof tag === "string" && tag.trim().length > 0).slice(0, 20)
    : [];
  const { data, error } = await getAdminClient()
    .from("agent_knowledge_items")
    .insert({
      user_id: auth.user.id,
      conversation_id: typeof body.conversationId === "string" ? body.conversationId : null,
      scope,
      title,
      content,
      tags,
      priority: Math.min(Math.max(Number(body.priority) || 1, 0), 10),
      metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({
      error: "Knowledge table is not ready. Run supabase/agent-brain-traces.sql first.",
      detail: error.message,
    }, { status: 503 });
  }

  return NextResponse.json({ item: data });
}
