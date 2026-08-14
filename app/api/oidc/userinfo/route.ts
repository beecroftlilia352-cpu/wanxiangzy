import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "@/lib/oidc/provider";

export const dynamic = "force-dynamic";

/** OIDC UserInfo 端点：Bearer access token → 用户声明 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const claims = verifyAccessToken(token);
  if (!claims) {
    return NextResponse.json({ error: "invalid_token" }, { status: 401 });
  }
  return NextResponse.json({
    sub: claims.sub,
    email: claims.email,
    ...(claims.name ? { name: claims.name } : {}),
  }, { headers: { "Cache-Control": "no-store" } });
}
