import { NextRequest, NextResponse } from "next/server";
import {
  consumeAuthorizationCode,
  getOidcClientId,
  issueAccessToken,
  issueIdToken,
  verifyClientCredentials,
  verifyPkce,
} from "@/lib/oidc/provider";

export const dynamic = "force-dynamic";

/**
 * OIDC Token 端点：授权码换 id_token + access_token。
 * 支持 client_secret_post（LibreChat openid-client 默认用 basic auth，这里兼容两种）。
 */
export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";
  let params: URLSearchParams;
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    params = new URLSearchParams();
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === "string") params.set(key, value);
    }
  } else {
    params = new URLSearchParams(await request.text().catch(() => ""));
  }

  const grantType = params.get("grant_type");
  const code = params.get("code");
  const clientId = params.get("client_id");
  const clientSecret = params.get("client_secret");
  const codeVerifier = params.get("code_verifier");

  // Basic auth 形式（client_id:client_secret）
  const authHeader = request.headers.get("authorization") || "";
  const basicMatch = authHeader.match(/^Basic\s+(.+)$/i);
  let basicClientId: string | null = null;
  let basicClientSecret: string | null = null;
  if (basicMatch) {
    const decoded = Buffer.from(basicMatch[1], "base64").toString();
    const separator = decoded.indexOf(":");
    if (separator > 0) {
      basicClientId = decoded.slice(0, separator);
      basicClientSecret = decoded.slice(separator + 1);
    }
  }

  const effectiveClientId = clientId || basicClientId;
  const effectiveClientSecret = clientSecret || basicClientSecret;
  if (!verifyClientCredentials(effectiveClientId, effectiveClientSecret)) {
    return NextResponse.json({ error: "invalid_client" }, { status: 401 });
  }

  if (grantType !== "authorization_code" || !code) {
    return NextResponse.json({ error: "unsupported_grant_type" }, { status: 400 });
  }

  const bundle = consumeAuthorizationCode(code);
  if (!bundle) {
    return NextResponse.json({ error: "invalid_grant", error_description: "授权码无效或已过期" }, { status: 400 });
  }

  if (bundle.codeChallenge && !verifyPkce(codeVerifier, bundle.codeChallenge, bundle.codeChallengeMethod)) {
    return NextResponse.json({ error: "invalid_grant", error_description: "PKCE 校验失败" }, { status: 400 });
  }

  const claims = { sub: bundle.sub, email: bundle.email, name: bundle.name };
  const audience = getOidcClientId();
  return NextResponse.json({
    access_token: issueAccessToken(claims, audience),
    id_token: issueIdToken(claims, audience),
    token_type: "Bearer",
    expires_in: 3600,
  }, { headers: { "Cache-Control": "no-store" } });
}
