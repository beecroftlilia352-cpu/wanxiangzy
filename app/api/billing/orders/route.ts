import { NextRequest, NextResponse } from "next/server";
import { buildOffsetPageInfo, escapeSupabaseLike, formatOrderNetAmount, parseAccountListQuery } from "@/lib/account/queries";
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
const ORDER_SORTS = ["newest", "oldest", "amount_desc", "amount_asc", "credits_desc", "updated_desc"] as const;
const ORDER_STATUSES = new Set(["pending", "processing", "paid", "failed", "canceled", "refunded", "partially_refunded"]);
const CREDIT_GRANT_STATUSES = new Set(["pending", "granted", "failed", "skipped", "refunded", "reversed", "partial"]);
const ORDER_MODES = new Set(["payment", "subscription"]);

export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiUser();
    if (auth.response) return auth.response;

    const admin = getAdminClient();
    const params = request.nextUrl.searchParams;
    const parsed = parseAccountListQuery(params, {
      allowedSorts: ORDER_SORTS,
      defaultSort: "newest",
      defaultLimit: 50,
      maxLimit: 100,
    });
    const status = params.get("status") || "";
    const creditGrantStatus = params.get("creditGrantStatus") || params.get("credit_grant_status") || "";
    const mode = params.get("mode") || "";
    const searchMatches = parsed.q ? await resolveSearchMatches(admin, parsed.q) : { productIds: [], priceIds: [] };

    let query = admin
      .from("payment_orders")
      .select(ORDER_FIELDS, { count: "exact" })
      .eq("user_id", auth.user.id);

    if (parsed.from) query = query.gte("created_at", parsed.from);
    if (parsed.to) query = query.lte("created_at", parsed.to);
    if (ORDER_STATUSES.has(status)) query = query.eq("status", status);
    if (CREDIT_GRANT_STATUSES.has(creditGrantStatus)) query = query.eq("credit_grant_status", creditGrantStatus);
    if (ORDER_MODES.has(mode)) query = query.eq("mode", mode);

    if (parsed.q) {
      const q = escapeSupabaseLike(parsed.q);
      const orParts = [
        `id.ilike.%${q}%`,
        `stripe_checkout_session_id.ilike.%${q}%`,
        `stripe_invoice_id.ilike.%${q}%`,
        ...searchMatches.productIds.map((id) => `product_id.eq.${id}`),
        ...searchMatches.priceIds.map((id) => `price_id.eq.${id}`),
      ];
      query = query.or(orParts.join(","));
    }

    if (parsed.sort === "oldest") {
      query = query.order("created_at", { ascending: true });
    } else if (parsed.sort === "amount_desc") {
      query = query.order("amount_total", { ascending: false }).order("created_at", { ascending: false });
    } else if (parsed.sort === "amount_asc") {
      query = query.order("amount_total", { ascending: true }).order("created_at", { ascending: false });
    } else if (parsed.sort === "credits_desc") {
      query = query.order("credits_granted", { ascending: false }).order("created_at", { ascending: false });
    } else if (parsed.sort === "updated_desc") {
      query = query.order("updated_at", { ascending: false });
    } else {
      query = query.order("created_at", { ascending: false });
    }

    const { data, error, count } = await query.range(parsed.offset, parsed.offset + parsed.limit);

    if (error) {
      const errorStatus = error.message.includes("payment_orders") ? 501 : 500;
      return NextResponse.json({ error: error.message }, { status: errorStatus });
    }

    const rows = Array.isArray(data) ? (data as unknown as Record<string, unknown>[]) : [];
    const pageRows = rows.slice(0, parsed.limit);
    const productIds = uniqueStrings(pageRows.map((row) => stringValue(row.product_id)));
    const priceIds = uniqueStrings(pageRows.map((row) => stringValue(row.price_id)));
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

    const orders = pageRows.map((row) => {
      const order = {
        id: stringValue(row.id),
        productId: stringValue(row.product_id),
        productName: productMap.get(stringValue(row.product_id)) || "灵点套餐",
        priceId: stringValue(row.price_id),
        priceLabel: priceMap.get(stringValue(row.price_id)) || "",
        mode: stringValue(row.mode),
        status: stringValue(row.status),
        currency: stringValue(row.currency) || "cny",
        amountTotal: numberValue(row.amount_total),
        amountRefunded: numberValue(row.amount_refunded),
        creditsExpected: numberValue(row.credits_expected),
        creditsGranted: numberValue(row.credits_granted),
        creditGrantStatus: numberValue(row.credits_expected) <= 0 && stringValue(row.status) === "paid" ? "skipped" : stringValue(row.credit_grant_status),
        checkoutSessionId: stringValue(row.stripe_checkout_session_id),
        invoiceId: stringValue(row.stripe_invoice_id),
        createdAt: stringValue(row.created_at),
        updatedAt: stringValue(row.updated_at),
      };
      return { ...order, amountNet: formatOrderNetAmount(order) };
    });

    return NextResponse.json(
      {
        orders,
        pageInfo: buildOffsetPageInfo(rows.length, parsed.limit, parsed.offset),
        summary: buildOrderSummary(orders, count ?? orders.length),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[billing/orders] error:", error);
    }
    return NextResponse.json({ error: "充值记录加载失败" }, { status: 500 });
  }
}

async function resolveSearchMatches(admin: ReturnType<typeof getAdminClient>, value: string) {
  const q = `%${escapeSupabaseLike(value)}%`;
  const [products, prices] = await Promise.all([
    admin.from("billing_products").select("id").ilike("name", q).limit(20),
    admin.from("billing_prices").select("id").ilike("label", q).limit(20),
  ]);
  return {
    productIds: ((products.data || []) as Record<string, unknown>[]).map((row) => stringValue(row.id)).filter(Boolean),
    priceIds: ((prices.data || []) as Record<string, unknown>[]).map((row) => stringValue(row.id)).filter(Boolean),
  };
}

function buildOrderSummary(orders: Array<{ amountNet: number; creditsGranted: number }>, count: number) {
  return orders.reduce(
    (summary, order) => {
      summary.pageNetAmount += order.amountNet;
      summary.pageGrantedCredits += Math.max(0, order.creditsGranted);
      return summary;
    },
    { pageNetAmount: 0, pageGrantedCredits: 0, count },
  );
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
