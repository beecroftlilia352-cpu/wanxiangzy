import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { syncChatBalance } from "@/lib/chat/balance-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * 把当前用户的灵点余额同步到 LibreChat tokenCredits。
 * 触发时机：用户进入 AI 对话前（前端调用）或 SSO 登录后自动调用。
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("credits")
      .eq("id", user.id)
      .maybeSingle();
    const credits = Number(profile?.credits ?? 0);

    const result = await syncChatBalance(user.email, credits);
    return NextResponse.json({
      ok: result.synced,
      tokenCredits: result.tokenCredits ?? null,
      message: result.message,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "同步失败" },
      { status: 500 },
    );
  }
}
