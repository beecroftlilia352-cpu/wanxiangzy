import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

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

  const { data, error } = await supabase
    .from("agent_messages")
    .insert({
      conversation_id: id,
      role: body.role || "user",
      content: body.content || "",
      images: body.images || [],
      generation: body.generation || null,
      params: body.params || {},
      mode: body.mode || "agent",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 更新对话的 updated_at
  await supabase
    .from("agent_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", id);

  return NextResponse.json(data);
}
