import { NextRequest, NextResponse } from "next/server";
import { getOidcDiscoveryDocument } from "@/lib/oidc/provider";

export const dynamic = "force-dynamic";

/** OIDC 标准发现文档路径 */
export async function GET(_request: NextRequest) {
  return NextResponse.json(getOidcDiscoveryDocument(), {
    headers: { "Cache-Control": "no-store" },
  });
}
