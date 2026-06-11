import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { refundBillingOrder } from "@/lib/billing/admin";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: Params) {
  const auth = await requireAdminApi("billing:operate");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await request.json().catch(() => ({})) as { amount?: unknown; reason?: unknown };
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const amount = body.amount === undefined || body.amount === null || body.amount === ""
    ? null
    : Number(body.amount);

  if (!id) return NextResponse.json({ error: "订单 ID 不能为空" }, { status: 400 });
  if (reason.length < 6 || reason.length > 240) {
    return NextResponse.json({ error: "reason 需要 6-240 个字符" }, { status: 400 });
  }
  if (amount !== null && (!Number.isFinite(amount) || amount <= 0)) {
    return NextResponse.json({ error: "amount 必须是正整数分金额" }, { status: 400 });
  }

  try {
    const refund = await refundBillingOrder({ orderId: id, amount, reason });
    await writeAdminAuditLog(auth.context, {
      action: "billing.order.refund",
      resourceType: "payment_order",
      resourceId: id,
      reason,
      metadata: { stripeRefundId: refund.id, amount },
    });
    return NextResponse.json({ ok: true, refund }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "退款失败" },
      { status: 400 }
    );
  }
}
