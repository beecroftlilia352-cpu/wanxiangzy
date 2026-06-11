import { getAdminClient } from "@/lib/supabase/admin";
import { getStripe, isStripeConfigured, isStripeWebhookConfigured } from "@/lib/billing/stripe";
import { applyRefundToOrder } from "@/lib/billing/refunds";
import { findOrderById } from "@/lib/billing/repository";

export type AdminBillingOverview = {
  metrics: {
    products: number;
    activePrices: number;
    paidOrders: number;
    pendingOrders: number;
    activeSubscriptions: number;
    failedWebhookEvents: number;
  };
  products: Record<string, unknown>[];
  prices: Record<string, unknown>[];
  orders: Record<string, unknown>[];
  subscriptions: Record<string, unknown>[];
  webhookEvents: Record<string, unknown>[];
  configStatus: {
    stripeSecretConfigured: boolean;
    webhookSecretConfigured: boolean;
    currency: "cny";
    oneTimeWallets: string[];
    subscriptionWallets: string[];
  };
  warnings: string[];
};

export async function listAdminBillingOverview(): Promise<AdminBillingOverview> {
  const warnings: string[] = [];
  const admin = getAdminClient();
  const [products, prices, orders, subscriptions, webhookEvents] = await Promise.all([
    safeSelect(admin.from("billing_products").select("*").order("sort_order", { ascending: true }).limit(100), "billing_products", warnings),
    safeSelect(admin.from("billing_prices").select("*").order("sort_order", { ascending: true }).limit(200), "billing_prices", warnings),
    safeSelect(admin.from("payment_orders").select("*").order("created_at", { ascending: false }).limit(100), "payment_orders", warnings),
    safeSelect(admin.from("stripe_subscriptions").select("*").order("updated_at", { ascending: false }).limit(100), "stripe_subscriptions", warnings),
    safeSelect(admin.from("stripe_webhook_events").select("*").order("received_at", { ascending: false }).limit(100), "stripe_webhook_events", warnings),
  ]);

  return {
    metrics: {
      products: products.length,
      activePrices: prices.filter((row) => row.active !== false).length,
      paidOrders: orders.filter((row) => row.status === "paid").length,
      pendingOrders: orders.filter((row) => row.status === "pending" || row.status === "checkout_open").length,
      activeSubscriptions: subscriptions.filter((row) => row.status === "active" || row.status === "trialing").length,
      failedWebhookEvents: webhookEvents.filter((row) => row.status === "failed").length,
    },
    products,
    prices,
    orders,
    subscriptions,
    webhookEvents,
    configStatus: {
      stripeSecretConfigured: isStripeConfigured(),
      webhookSecretConfigured: isStripeWebhookConfigured(),
      currency: "cny",
      oneTimeWallets: ["card", "alipay", "wechat_pay"],
      subscriptionWallets: ["card", "link"],
    },
    warnings,
  };
}

export async function refundBillingOrder(params: {
  orderId: string;
  amount?: number | null;
  reason: string;
}) {
  const order = await findOrderById(params.orderId);
  if (!order) throw new Error("支付订单不存在");
  if (!order.stripePaymentIntentId) throw new Error("订单缺少 Stripe PaymentIntent，无法退款");

  const refund = await getStripe().refunds.create({
    payment_intent: order.stripePaymentIntentId,
    amount: params.amount && params.amount > 0 ? Math.floor(params.amount) : undefined,
    metadata: {
      orderId: order.id,
      userId: order.userId,
      reason: params.reason,
    },
  }, {
    idempotencyKey: `refund:${order.id}:${params.amount || "full"}`,
  });

  if (refund.status === "succeeded") {
    const refundAmount = typeof refund.amount === "number" ? refund.amount : (params.amount || order.amountTotal);
    await applyRefundToOrder({
      order,
      cumulativeAmountRefunded: order.amountRefunded + refundAmount,
      reason: `管理员退款扣回积分：${params.reason}`,
    });
  }

  return refund;
}

export async function syncBillingCatalogWithStripe() {
  const admin = getAdminClient();
  const stripe = getStripe();
  const warnings: string[] = [];

  const [{ data: productRows, error: productError }, { data: priceRows, error: priceError }] = await Promise.all([
    admin.from("billing_products").select("*").order("sort_order", { ascending: true }),
    admin.from("billing_prices").select("*").order("sort_order", { ascending: true }),
  ]);

  if (productError) throw new Error(productError.message);
  if (priceError) throw new Error(priceError.message);

  const productStripeIds = new Map<string, string>();
  let createdProducts = 0;
  let updatedProducts = 0;
  let createdPrices = 0;

  for (const product of productRows || []) {
    const productId = stringValue(product.id);
    if (!productId) continue;

    let stripeProductId = nullableString(product.stripe_product_id);
    const metadata = stripeMetadata({
      ...(isRecord(product.metadata) ? product.metadata : {}),
      billingProductId: productId,
      tierKey: product.tier_key,
    });

    if (!stripeProductId) {
      const stripeProduct = await stripe.products.create({
        name: stringValue(product.name) || productId,
        description: nullableString(product.description) || undefined,
        active: product.active !== false,
        metadata,
      });
      stripeProductId = stripeProduct.id;
      createdProducts += 1;
      await admin
        .from("billing_products")
        .update({ stripe_product_id: stripeProductId, updated_at: new Date().toISOString() })
        .eq("id", productId);
    } else {
      await stripe.products.update(stripeProductId, {
        name: stringValue(product.name) || productId,
        description: nullableString(product.description) || undefined,
        active: product.active !== false,
        metadata,
      }).then(
        () => {
          updatedProducts += 1;
        },
        (error) => {
          warnings.push(`${productId}: ${error instanceof Error ? error.message : "Stripe product update failed"}`);
        },
      );
    }

    productStripeIds.set(productId, stripeProductId);
  }

  for (const price of priceRows || []) {
    const priceId = stringValue(price.id);
    const productId = stringValue(price.product_id);
    const stripeProductId = productStripeIds.get(productId);
    if (!priceId || !stripeProductId || nullableString(price.stripe_price_id)) continue;

    const mode = stringValue(price.mode) === "subscription" ? "subscription" : "payment";
    const stripePrice = await stripe.prices.create({
      product: stripeProductId,
      currency: stringValue(price.currency) || "cny",
      unit_amount: numberValue(price.unit_amount),
      recurring: mode === "subscription" ? { interval: "month" } : undefined,
      nickname: nullableString(price.label) || undefined,
      metadata: stripeMetadata({
        ...(isRecord(price.metadata) ? price.metadata : {}),
        billingPriceId: priceId,
        billingProductId: productId,
        mode,
        credits: price.credits,
      }),
    });

    createdPrices += 1;
    await admin
      .from("billing_prices")
      .update({ stripe_price_id: stripePrice.id, updated_at: new Date().toISOString() })
      .eq("id", priceId);
  }

  return {
    ok: true,
    createdProducts,
    updatedProducts,
    createdPrices,
    warnings,
  };
}

export async function cancelBillingSubscription(params: {
  stripeSubscriptionId: string;
  cancelAtPeriodEnd: boolean;
}) {
  const stripe = getStripe();
  if (params.cancelAtPeriodEnd) {
    return stripe.subscriptions.update(params.stripeSubscriptionId, { cancel_at_period_end: true });
  }
  return stripe.subscriptions.cancel(params.stripeSubscriptionId);
}

async function safeSelect<T extends Record<string, unknown>>(
  query: PromiseLike<{ data: T[] | null; error: { message?: string } | null }>,
  label: string,
  warnings: string[],
) {
  try {
    const { data, error } = await query;
    if (error) {
      warnings.push(`${label}: ${error.message || "unavailable"}`);
      return [];
    }
    return data || [];
  } catch (error) {
    warnings.push(`${label}: ${error instanceof Error ? error.message : "unavailable"}`);
    return [];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function nullableString(value: unknown) {
  const text = stringValue(value).trim();
  return text || null;
}

function numberValue(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.floor(num) : 0;
}

function stripeMetadata(value: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined && item !== null)
      .map(([key, item]) => [key, String(item).slice(0, 500)]),
  );
}
