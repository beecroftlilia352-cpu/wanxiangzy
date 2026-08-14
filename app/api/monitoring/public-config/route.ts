import { NextResponse } from "next/server";
import { getSiteMonitoringConfig } from "@/lib/site-config";

export const dynamic = "force-dynamic";

/**
 * 客户端 Sentry 初始化所需的公开配置（仅暴露 DSN，无其他敏感信息）。
 */
export async function GET() {
  const envDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (envDsn) {
    return NextResponse.json({ sentryDsn: envDsn }, { headers: { "Cache-Control": "no-store" } });
  }
  const config = await getSiteMonitoringConfig().catch(() => null);
  return NextResponse.json(
    { sentryDsn: config?.sentryDsn || "" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
