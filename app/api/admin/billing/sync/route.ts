import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { syncBillingCatalogWithStripe } from "@/lib/billing/admin";

export async function POST() {
  const auth = await requireAdminApi("billing:operate");
  if (!auth.ok) return auth.response;

  try {
    const result = await syncBillingCatalogWithStripe();
    await writeAdminAuditLog(auth.context, {
      action: "billing.catalog.sync_stripe",
      resourceType: "billing_catalog",
      reason: "管理员后台同步 Stripe 商品价格",
      metadata: result,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "同步 Stripe 商品价格失败" },
      { status: 400 },
    );
  }
}
