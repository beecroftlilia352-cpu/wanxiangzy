import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { deriveConversationTitle, isDefaultConversationTitle } from "@/lib/agent/conversation-title";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { data, error } = await supabase
    .from("agent_messages")
    .select("*")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const role = body.role || "user";

  const { data: conversation, error: conversationError } = await supabase
    .from("agent_conversations")
    .select("id,title")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (conversationError || !conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("agent_messages")
    .insert({
      ...(typeof body.id === "string" ? { id: body.id } : {}),
      conversation_id: id,
      role,
      content: body.content || "",
      images: body.images || [],
      generation: body.generation || null,
      params: body.params || {},
      mode: body.mode || "agent",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const conversationUpdates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (role === "user" && isDefaultConversationTitle(conversation.title)) {
    conversationUpdates.title = deriveConversationTitle(body.content, body.images);
  }

  // 更新对话的 updated_at，并在第一条用户消息后生成历史标题
  await supabase
    .from("agent_conversations")
    .update(conversationUpdates)
    .eq("id", id)
    .eq("user_id", user.id);

  return NextResponse.json(data);
}

/** 更新消息（用于更新 generation 状态） */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: convId } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const messageId = body.messageId;
  if (!messageId) return NextResponse.json({ error: "Missing messageId" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (body.content !== undefined) updates.content = body.content;
  if (body.generation !== undefined) updates.generation = body.generation;
  if (body.images !== undefined) updates.images = body.images;
  if (body.params !== undefined) updates.params = body.params;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("agent_messages")
    .update(updates)
    .eq("id", messageId)
    .eq("conversation_id", convId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
