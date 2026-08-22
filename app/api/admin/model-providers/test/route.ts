import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";

export async function POST() {
  const auth = await requireAdminApi("providers:write");
  if (!auth.ok) return auth.response;
  return NextResponse.json({
    error: "旧供应商测试入口已停用，请使用统一模型控制台 /admin/providers",
    configKey: "ai.control-plane.v1",
  }, { status: 410, headers: { "Cache-Control": "no-store" } });
}
