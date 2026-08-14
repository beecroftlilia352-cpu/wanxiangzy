import { NextRequest, NextResponse } from "next/server";
import { getOidcDiscoveryDocument } from "@/lib/oidc/provider";

export const dynamic = "force-dynamic";

/** OIDC 发现文档（无 .well-known 路径也能被 openid-client 发现） */
export async function GET(_request: NextRequest) {
  return NextResponse.json(getOidcDiscoveryDocument(), {
    headers: { "Cache-Control": "no-store" },
  });
}
