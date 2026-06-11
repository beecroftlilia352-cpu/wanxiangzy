import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { getAdminClient } from "@/lib/supabase/admin";

const ORDER_FIELDS = [
  "id",
  "product_id",
  "price_id",
  "mode",
  "status",
  "currency",
  "amount_total",
  "amount_refunded",
  "credits_expected",
  "credits_granted",
  "credit_grant_status",
  "stripe_checkout_session_id",
  "stripe_invoice_id",
  "created_at",
  "updated_at",
].join(",");

const PRODUCT_FIELDS = "id,name";
const PRICE_FIELDS = "id,label";

export async function GET() {
  try {
    const auth = await requireApiUser();
    if (auth.response) return auth.response;

    const admin = getAdminClient();
    const { data, error } = await admin
      .from("payment_orders")
      .select(ORDER_FIELDS)
      .eq("user_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      const status = error.message.includes("payment_orders") ? 501 : 500;
      return NextResponse.json({ error: error.message }, { status });
    }

    const orders = Array.isArray(data) ? (data as unknown as Record<string, unknown>[]) : [];
    const productIds = uniqueStrings(orders.map((row) => stringValue(row.product_id)));
    const priceIds = uniqueStrings(orders.map((row) => stringValue(row.price_id)));
    const [products, prices] = await Promise.all([
      productIds.length
        ? admin.from("billing_products").select(PRODUCT_FIELDS).in("id", productIds)
        : Promise.resolve({ data: [], error: null }),
      priceIds.length
        ? admin.from("billing_prices").select(PRICE_FIELDS).in("id", priceIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const productMap = new Map<string, string>();
    for (const row of ((products.data || []) as Record<string, unknown>[])) {
      const id = stringValue(row.id);
      if (id) productMap.set(id, stringValue(row.name));
    }

    const priceMap = new Map<string, string>();
    for (const row of ((prices.data || []) as Record<string, unknown>[])) {
      const id = stringValue(row.id);
      if (id) priceMap.set(id, stringValue(row.label));
    }

    return NextResponse.json(
      {
        orders: orders.map((row) => ({
          id: stringValue(row.id),
          productId: stringValue(row.product_id),
          productName: productMap.get(stringValue(row.product_id)) || "积分套餐",
          priceId: stringValue(row.price_id),
          priceLabel: priceMap.get(stringValue(row.price_id)) || "",
          mode: stringValue(row.mode),
          status: stringValue(row.status),
          currency: stringValue(row.currency) || "cny",
          amountTotal: numberValue(row.amount_total),
          amountRefunded: numberValue(row.amount_refunded),
          creditsExpected: numberValue(row.credits_expected),
          creditsGranted: numberValue(row.credits_granted),
          creditGrantStatus: stringValue(row.credit_grant_status),
          checkoutSessionId: stringValue(row.stripe_checkout_session_id),
          invoiceId: stringValue(row.stripe_invoice_id),
          createdAt: stringValue(row.created_at),
          updatedAt: stringValue(row.updated_at),
        })),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[billing/orders] error:", error);
    }
    return NextResponse.json({ error: "充值记录加载失败" }, { status: 500 });
  }
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function numberValue(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}
