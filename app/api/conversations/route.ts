import { NextRequest, NextResponse } from "next/server";
import { API_RATE_LIMITS, enforceApiRateLimit } from "@/lib/api/rate-limit";
import { createServerSupabase } from "@/lib/supabase/server";
import { DEFAULT_CONVERSATION_TITLE, deriveConversationTitle, isDefaultConversationTitle } from "@/lib/agent/conversation-title";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const rateLimit = await enforceApiRateLimit(user.id, API_RATE_LIMITS.conversationReadMutation);
  if (rateLimit) return rateLimit;

  const { data, error } = await supabase
    .from("agent_conversations")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const conversations = data || [];
  const defaultTitleIds = conversations
    .filter((conversation) => isDefaultConversationTitle(conversation.title))
    .map((conversation) => conversation.id);

  if (defaultTitleIds.length > 0) {
    const { data: firstMessages } = await supabase
      .from("agent_messages")
      .select("conversation_id,content,images,created_at")
      .in("conversation_id", defaultTitleIds)
      .eq("role", "user")
      .order("created_at", { ascending: true });

    const titleByConversation = new Map<string, string>();
    for (const message of firstMessages || []) {
      if (titleByConversation.has(message.conversation_id)) continue;
      const title = deriveConversationTitle(message.content, message.images);
      if (!isDefaultConversationTitle(title)) titleByConversation.set(message.conversation_id, title);
    }

    if (titleByConversation.size > 0) {
      await Promise.all(
        conversations.map(async (conversation) => {
          const title = titleByConversation.get(conversation.id);
          if (!title) return;
          conversation.title = title;
          await supabase
            .from("agent_conversations")
            .update({ title })
            .eq("id", conversation.id)
            .eq("user_id", user.id);
        }),
      );
    }
  }

  return NextResponse.json(conversations);
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const rateLimit = await enforceApiRateLimit(user.id, API_RATE_LIMITS.conversationMutation);
  if (rateLimit) return rateLimit;

  const body = await request.json().catch(() => ({}));
  const title = typeof body.title === "string" && body.title.trim()
    ? body.title.trim()
    : DEFAULT_CONVERSATION_TITLE;
  const mode = body.mode === "chat" ? "chat" : "agent";

  const { data, error } = await supabase
    .from("agent_conversations")
    .insert({ user_id: user.id, title, mode, images: [] })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
