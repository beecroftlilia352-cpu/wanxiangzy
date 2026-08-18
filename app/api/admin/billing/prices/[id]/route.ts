import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { getStripe } from "@/lib/billing/stripe";
import { getAdminClient } from "@/lib/supabase/admin";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi("billing:write");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as { active?: unknown };
  if (!id || typeof body.active !== "boolean") {
    return NextResponse.json({ error: "需要指定价格与启用状态" }, { status: 400 });
  }

  const admin = getAdminClient();
  const { data: existing, error: readError } = await admin
    .from("billing_prices")
    .select("id,stripe_price_id,active")
    .eq("id", id)
    .maybeSingle();
  if (readError || !existing) return NextResponse.json({ error: readError?.message || "价格不存在" }, { status: 404 });

  const { data, error } = await admin
    .from("billing_prices")
    .update({ active: body.active, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const stripePriceId = typeof existing.stripe_price_id === "string" ? existing.stripe_price_id : "";
  if (stripePriceId) {
    try {
      await getStripe().prices.update(stripePriceId, { active: body.active });
    } catch (stripeError) {
      await admin.from("billing_prices").update({ active: existing.active, updated_at: new Date().toISOString() }).eq("id", id);
      return NextResponse.json({ error: stripeError instanceof Error ? `Stripe 更新失败：${stripeError.message}` : "Stripe 更新失败" }, { status: 502 });
    }
  }

  await writeAdminAuditLog(auth.context, {
    action: body.active ? "billing.price.activate" : "billing.price.retire",
    resourceType: "billing_price",
    resourceId: id,
    reason: body.active ? "启用售卖价格" : "停用售卖价格",
    metadata: { stripePriceId: stripePriceId || null },
  });
  return NextResponse.json({ ok: true, price: data }, { headers: { "Cache-Control": "no-store" } });
}
