/**
 * /auth/callback
 *
 * Supabase 邮箱确认链接的回调路由
 * 用户点击确认邮件中的链接后，Supabase 会重定向到这里
 */

import { createServerSupabase } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/create";

  if (code) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // 如果失败，回到登录页
  return NextResponse.redirect(`${origin}/login`);
}
