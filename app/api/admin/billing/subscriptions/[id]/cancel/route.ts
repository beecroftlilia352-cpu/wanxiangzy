import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { cancelBillingSubscription } from "@/lib/billing/admin";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAdminApi("billing:operate");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await request.json().catch(() => ({})) as {
    cancelAtPeriodEnd?: unknown;
    reason?: unknown;
  };
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const cancelAtPeriodEnd = body.cancelAtPeriodEnd !== false;

  if (!id || !id.startsWith("sub_")) {
    return NextResponse.json({ error: "Stripe subscription ID 不合法" }, { status: 400 });
  }
  if (reason.length < 6 || reason.length > 240) {
    return NextResponse.json({ error: "reason 需要 6-240 个字符" }, { status: 400 });
  }

  try {
    const subscription = await cancelBillingSubscription({ stripeSubscriptionId: id, cancelAtPeriodEnd });
    await writeAdminAuditLog(auth.context, {
      action: cancelAtPeriodEnd ? "billing.subscription.cancel_at_period_end" : "billing.subscription.cancel_now",
      resourceType: "stripe_subscription",
      resourceId: id,
      reason,
      metadata: { status: subscription.status, cancelAtPeriodEnd },
    });
    return NextResponse.json({ ok: true, subscription }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "取消订阅失败" },
      { status: 400 }
    );
  }
}
