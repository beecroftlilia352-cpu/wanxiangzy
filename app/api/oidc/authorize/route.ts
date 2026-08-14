import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { syncChatBalance } from "@/lib/chat/balance-sync";
import { issueAuthorizationCode } from "@/lib/oidc/provider";

export const dynamic = "force-dynamic";

/**
 * OIDC 授权端点：
 * 1. 校验当前 Supabase 会话（未登录 → 重定向到主站登录页，登录后回跳本端点）
 * 2. 校验 redirect_uri 白名单（仅允许 LibreChat 回调）
 * 3. 签发授权码并重定向回 LibreChat
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const clientId = url.searchParams.get("client_id");
  const redirectUri = url.searchParams.get("redirect_uri");
  const state = url.searchParams.get("state");
  const codeChallenge = url.searchParams.get("code_challenge");
  const codeChallengeMethod = url.searchParams.get("code_challenge_method");

  const expectedClientId = process.env.OIDC_CLIENT_ID;
  const allowedRedirect = new Set(
    (process.env.OIDC_ALLOWED_REDIRECT_URIS || "/oauth/openid/callback")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );

  if (clientId !== expectedClientId || !redirectUri || !allowedRedirect.has(redirectUri)) {
    return NextResponse.json({ error: "invalid_request", error_description: "client_id 或 redirect_uri 无效" }, { status: 400 });
  }

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) {
    // 未登录：记录意图并跳主站登录，登录后回跳本端点
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set("next", `${url.pathname}?${url.searchParams.toString()}`);
    return NextResponse.redirect(loginUrl);
  }

  const code = issueAuthorizationCode(
    {
      sub: user.id,
      email: user.email,
      name: (user.user_metadata?.display_name as string | undefined) || undefined,
    },
    codeChallenge ? {
      codeChallenge,
      codeChallengeMethod: codeChallengeMethod || "S256",
    } : {},
  );

  // 顺手同步灵点余额到 LibreChat（不阻塞 SSO 流程）
  const { data: profile } = await supabase
    .from("profiles")
    .select("credits")
    .eq("id", user.id)
    .maybeSingle();
  void syncChatBalance(user.email, Number(profile?.credits ?? 0));

  const redirect = new URL(redirectUri);
  redirect.searchParams.set("code", code);
  if (state) redirect.searchParams.set("state", state);
  return NextResponse.redirect(redirect);
}
