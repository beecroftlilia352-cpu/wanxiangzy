import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { normalizeSubscriptionBonusPercent } from "@/lib/billing/catalog";
import { getAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const auth = await requireAdminApi("billing:write");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const tierKey = cleanKey(body.tierKey);
  const name = stringValue(body.name).trim();
  const description = stringValue(body.description).trim();
  const id = cleanKey(body.id) || (tierKey ? `prod_${tierKey}` : "");
  const subscriptionBonusPercent = normalizeSubscriptionBonusPercent(body.subscriptionBonusPercent);

  if (!id || !tierKey || !name || subscriptionBonusPercent === null) {
    return NextResponse.json({ error: subscriptionBonusPercent === null ? "订阅加成必须在 0 到 100 之间" : "id、tierKey 和 name 必填" }, { status: 400 });
  }

  const row = {
    id,
    tier_key: tierKey,
    kind: "credit_tier",
    name,
    description,
    badge: stringValue(body.badge).trim() || null,
    credit_amount: intValue(body.creditAmount),
    bonus_credits: intValue(body.bonusCredits),
    subscription_bonus_percent: subscriptionBonusPercent,
    features: Array.isArray(body.features) ? body.features.map(String).filter(Boolean) : [],
    active: body.active !== false,
    sort_order: intValue(body.sortOrder),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await getAdminClient()
    .from("billing_products")
    .upsert(row, { onConflict: "id" })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAdminAuditLog(auth.context, {
    action: "billing.product.upsert",
    resourceType: "billing_product",
    resourceId: id,
    reason: `Upsert billing product ${name}`,
    metadata: { tierKey },
  });

  return NextResponse.json({ ok: true, product: data }, { headers: { "Cache-Control": "no-store" } });
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
