import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { getStripe } from "@/lib/billing/stripe";
import { processStripeEvent } from "@/lib/billing/webhook-handler";

export async function POST(request: Request) {
  const auth = await requireAdminApi("billing:operate");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({})) as { eventId?: unknown };
  const eventId = typeof body.eventId === "string" ? body.eventId.trim() : "";
  if (!eventId || !eventId.startsWith("evt_")) {
    return NextResponse.json({ error: "Stripe eventId 不合法" }, { status: 400 });
  }

  try {
    const event = await getStripe().events.retrieve(eventId);
    const result = await processStripeEvent(event, { force: true });
    await writeAdminAuditLog(auth.context, {
      action: "billing.webhook_event.replay",
      resourceType: "stripe_webhook_event",
      resourceId: eventId,
      reason: "管理员后台重放 Stripe Webhook 事件",
      metadata: { type: event.type, result },
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "重放 Webhook 事件失败" },
      { status: 400 },
    );
  }
}
