import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { getAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const auth = await requireAdminApi("billing:write");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const productId = stringValue(body.productId).trim();
  const mode = stringValue(body.mode) === "subscription" ? "subscription" : "payment";
  const id = cleanKey(body.id) || `price_${productId.replace(/^prod_/, "")}_${mode}_${Date.now()}`;
  const label = stringValue(body.label).trim() || (mode === "subscription" ? "月订阅" : "一次性购买");
  const unitAmount = intValue(body.unitAmount);
  const credits = intValue(body.credits);

  if (!productId || !id || unitAmount <= 0 || credits <= 0) {
    return NextResponse.json({ error: "productId、unitAmount 和 credits 必填且必须大于 0" }, { status: 400 });
  }

  const row = {
    id,
    product_id: productId,
    mode,
    label,
    currency: "cny",
    unit_amount: unitAmount,
    interval: mode === "subscription" ? "month" : null,
    credits,
    wallet_enabled: mode === "payment" && body.walletEnabled !== false,
    active: body.active !== false,
    sort_order: intValue(body.sortOrder),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await getAdminClient()
    .from("billing_prices")
    .insert(row)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAdminAuditLog(auth.context, {
    action: "billing.price.create",
    resourceType: "billing_price",
    resourceId: id,
    reason: `Create ${mode} price ${label}`,
    metadata: { productId, unitAmount, credits },
  });

  return NextResponse.json({ ok: true, price: data }, { headers: { "Cache-Control": "no-store" } });
}

function cleanKey(value: unknown) {
  return stringValue(value).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function intValue(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(0, Math.floor(num)) : 0;
}
