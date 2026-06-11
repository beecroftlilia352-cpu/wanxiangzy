import type Stripe from "stripe";
import {
  SEEDED_BILLING_CATALOG,
  findSeededPrice,
  type BillingCatalog,
  type BillingMode,
  type BillingPrice,
  type BillingProduct,
} from "@/lib/billing/catalog";
import { getAdminClient } from "@/lib/supabase/admin";

type BillingProductRow = Record<string, unknown>;
type BillingPriceRow = Record<string, unknown>;

export type CheckoutPriceBundle = {
  product: BillingProduct;
  price: BillingPrice;
};

export type BillingOrder = {
  id: string;
  userId: string;
  productId: string;
  priceId: string;
  mode: BillingMode;
  status: string;
  amountTotal: number;
  amountRefunded: number;
  creditsExpected: number;
  creditsGranted: number;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  stripeInvoiceId: string | null;
  stripeSubscriptionId: string | null;
};

export async function getBillingCatalog(): Promise<BillingCatalog> {
  const warnings: string[] = [];
  try {
    const admin = getAdminClient();
    const [{ data: productRows, error: productError }, { data: priceRows, error: priceError }] = await Promise.all([
      admin.from("billing_products").select("*").order("sort_order", { ascending: true }),
      admin.from("billing_prices").select("*").order("sort_order", { ascending: true }),
    ]);

    if (productError || priceError) {
      const message = productError?.message || priceError?.message || "billing catalog unavailable";
      warnings.push(message);
      return { ...SEEDED_BILLING_CATALOG, warnings };
    }

    const prices = (priceRows || []).map(priceRowToClient);
    const pricesByProduct = new Map<string, BillingPrice[]>();
    prices.forEach((price) => {
      const list = pricesByProduct.get(price.productId) || [];
      list.push(price);
      pricesByProduct.set(price.productId, list);
    });

    const products = (productRows || [])
      .map((row) => productRowToClient(row, pricesByProduct.get(stringValue(row.id)) || []))
      .filter((product) => product.active)
      .map((product) => ({
        ...product,
        prices: product.prices.filter((price) => price.active),
      }));

    return {
      products,
      config: SEEDED_BILLING_CATALOG.config,
      warnings,
    };
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "billing catalog unavailable");
    return { ...SEEDED_BILLING_CATALOG, warnings };
  }
}

export async function getCheckoutPriceBundle(priceId: string): Promise<CheckoutPriceBundle | null> {
  try {
    const admin = getAdminClient();
    const { data: priceRow, error: priceError } = await admin
      .from("billing_prices")
      .select("*")
      .eq("id", priceId)
      .eq("active", true)
      .maybeSingle();

    if (priceError || !priceRow) return findSeededPrice(priceId);

    const price = priceRowToClient(priceRow);
    const { data: productRow, error: productError } = await admin
      .from("billing_products")
      .select("*")
      .eq("id", price.productId)
      .eq("active", true)
      .maybeSingle();

    if (productError || !productRow) return null;
    return { product: productRowToClient(productRow, [price]), price };
  } catch {
    return findSeededPrice(priceId);
  }
}

export async function getOrCreateStripeCustomer(params: {
  userId: string;
  email: string | null | undefined;
  stripe: Stripe;
}) {
  const admin = getAdminClient();
  const existing = await admin
    .from("stripe_customers")
    .select("stripe_customer_id")
    .eq("user_id", params.userId)
    .maybeSingle();

  const existingCustomerId = stringValue(existing.data?.stripe_customer_id);
  if (existingCustomerId) return existingCustomerId;

  const customer = await params.stripe.customers.create({
    email: params.email || undefined,
    metadata: { userId: params.userId },
  });

  const { error } = await admin.from("stripe_customers").upsert({
    user_id: params.userId,
    email: params.email || null,
    stripe_customer_id: customer.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });

  if (error) throw new Error(error.message);
  return customer.id;
}

export async function ensureStripePrice(params: {
  stripe: Stripe;
  product: BillingProduct;
  price: BillingPrice;
}) {
  if (params.price.stripePriceId) return params.price.stripePriceId;

  const admin = getAdminClient();
  let stripeProductId = params.product.stripeProductId;
  if (!stripeProductId) {
    const stripeProduct = await params.stripe.products.create({
      name: params.product.name,
      description: params.product.description,
      metadata: {
        billingProductId: params.product.id,
        tierKey: params.product.tierKey,
      },
    });
    stripeProductId = stripeProduct.id;
    await admin
      .from("billing_products")
      .update({ stripe_product_id: stripeProductId, updated_at: new Date().toISOString() })
      .eq("id", params.product.id);
  }

  const stripePrice = await params.stripe.prices.create({
    product: stripeProductId,
    currency: params.price.currency,
    unit_amount: params.price.unitAmount,
    recurring: params.price.mode === "subscription" ? { interval: "month" } : undefined,
    metadata: {
      billingProductId: params.product.id,
      billingPriceId: params.price.id,
      mode: params.price.mode,
      credits: String(params.price.credits),
    },
  });

  await admin
    .from("billing_prices")
    .update({ stripe_price_id: stripePrice.id, updated_at: new Date().toISOString() })
    .eq("id", params.price.id);

  return stripePrice.id;
}

export async function createPaymentOrder(params: {
  userId: string;
  product: BillingProduct;
  price: BillingPrice;
  stripeCustomerId: string;
}) {
  const { data, error } = await getAdminClient()
    .from("payment_orders")
    .insert({
      user_id: params.userId,
      product_id: params.product.id,
      price_id: params.price.id,
      mode: params.price.mode,
      status: "checkout_created",
      currency: params.price.currency,
      amount_total: params.price.unitAmount,
      credits_expected: params.price.credits,
      stripe_customer_id: params.stripeCustomerId,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return stringValue(data?.id);
}

export async function attachCheckoutSessionToOrder(params: {
  orderId: string;
  session: Stripe.Checkout.Session;
}) {
  const { error } = await getAdminClient()
    .from("payment_orders")
    .update({
      status: "checkout_open",
      stripe_checkout_session_id: params.session.id,
      stripe_payment_intent_id: stripeId(params.session.payment_intent),
      stripe_subscription_id: stripeId(params.session.subscription),
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.orderId);

  if (error) throw new Error(error.message);
}

export async function findOrderByCheckoutSession(sessionId: string) {
  return findOrderBy("stripe_checkout_session_id", sessionId);
}

export async function findOrderByInvoice(invoiceId: string) {
  return findOrderBy("stripe_invoice_id", invoiceId);
}

export async function findOrderByPaymentIntent(paymentIntentId: string) {
  return findOrderBy("stripe_payment_intent_id", paymentIntentId);
}

export async function findOrderById(orderId: string) {
  return findOrderBy("id", orderId);
}

export async function markOrderFromCheckoutSession(session: Stripe.Checkout.Session, status: string) {
  const { error } = await getAdminClient()
    .from("payment_orders")
    .update({
      status,
      stripe_payment_intent_id: stripeId(session.payment_intent),
      stripe_subscription_id: stripeId(session.subscription),
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_checkout_session_id", session.id);

  if (error) throw new Error(error.message);
}

export async function markOrderRefunded(params: {
  orderId: string;
  amountRefunded: number;
  fullyRefunded: boolean;
}) {
  const { error } = await getAdminClient()
    .from("payment_orders")
    .update({
      status: params.fullyRefunded ? "refunded" : "partially_refunded",
      amount_refunded: params.amountRefunded,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.orderId);

  if (error) throw new Error(error.message);
}

export async function createInvoiceOrder(params: {
  userId: string;
  subscriptionId: string;
  invoiceId: string;
  stripeCustomerId: string;
  stripePriceId: string;
}) {
  const bundle = await findBundleByStripePrice(params.stripePriceId);
  if (!bundle) throw new Error(`No billing price for Stripe price ${params.stripePriceId}`);

  const existing = await findOrderByInvoice(params.invoiceId);
  if (existing) return existing.id;

  const { data, error } = await getAdminClient()
    .from("payment_orders")
    .insert({
      user_id: params.userId,
      product_id: bundle.product.id,
      price_id: bundle.price.id,
      mode: "subscription",
      status: "paid",
      currency: bundle.price.currency,
      amount_total: bundle.price.unitAmount,
      credits_expected: bundle.price.credits,
      stripe_customer_id: params.stripeCustomerId,
      stripe_subscription_id: params.subscriptionId,
      stripe_invoice_id: params.invoiceId,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return stringValue(data?.id);
}

export async function upsertStripeSubscription(params: {
  userId: string;
  subscription: Stripe.Subscription;
  productId: string | null;
  priceId: string | null;
}) {
  const currentPeriodStart = timestampToIso((params.subscription as unknown as { current_period_start?: number }).current_period_start);
  const currentPeriodEnd = timestampToIso((params.subscription as unknown as { current_period_end?: number }).current_period_end);
  const { error } = await getAdminClient()
    .from("stripe_subscriptions")
    .upsert({
      user_id: params.userId,
      product_id: params.productId,
      price_id: params.priceId,
      stripe_subscription_id: params.subscription.id,
      stripe_customer_id: stripeId(params.subscription.customer),
      status: params.subscription.status,
      cancel_at_period_end: params.subscription.cancel_at_period_end,
      current_period_start: currentPeriodStart,
      current_period_end: currentPeriodEnd,
      latest_invoice_id: stripeId(params.subscription.latest_invoice),
      updated_at: new Date().toISOString(),
    }, { onConflict: "stripe_subscription_id" });

  if (error) throw new Error(error.message);
}

export async function findUserIdByStripeCustomer(stripeCustomerId: string) {
  const { data } = await getAdminClient()
    .from("stripe_customers")
    .select("user_id")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();
  return stringValue(data?.user_id) || null;
}

export async function findBundleByStripePrice(stripePriceId: string): Promise<CheckoutPriceBundle | null> {
  const { data: priceRow, error: priceError } = await getAdminClient()
    .from("billing_prices")
    .select("*")
    .eq("stripe_price_id", stripePriceId)
    .maybeSingle();

  if (priceError || !priceRow) return null;
  const price = priceRowToClient(priceRow);
  const { data: productRow, error: productError } = await getAdminClient()
    .from("billing_products")
    .select("*")
    .eq("id", price.productId)
    .maybeSingle();

  if (productError || !productRow) return null;
  return { product: productRowToClient(productRow, [price]), price };
}

export async function grantOrderCredits(orderId: string, reason: string) {
  const { data, error } = await getAdminClient().rpc("grant_billing_order_credits", {
    p_order_id: orderId,
    p_reason: reason,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function reverseOrderCredits(params: {
  orderId: string;
  credits: number | null;
  reason: string;
}) {
  const { data, error } = await getAdminClient().rpc("reverse_billing_order_credits", {
    p_order_id: params.orderId,
    p_requested_credits: params.credits,
    p_reason: params.reason,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function claimStripeEvent(event: Stripe.Event, options: { force?: boolean } = {}) {
  const admin = getAdminClient();
  const now = new Date().toISOString();
  const payload = summarizeStripeEvent(event);

  const { data: existing, error: readError } = await admin
    .from("stripe_webhook_events")
    .select("event_id,status,attempts")
    .eq("event_id", event.id)
    .maybeSingle();

  if (readError) throw new Error(readError.message);

  if (!existing) {
    const { error } = await admin.from("stripe_webhook_events").insert({
      event_id: event.id,
      type: event.type,
      status: "processing",
      attempts: 1,
      payload,
      received_at: now,
    });
    if (error) {
      if (isUniqueViolation(error)) return false;
      throw new Error(error.message);
    }
    return true;
  }

  const status = stringValue(existing.status);
  if (!options.force && (status === "processed" || status === "processing")) {
    return false;
  }

  const attempts = numberValue(existing.attempts) + 1;
  const { error } = await admin
    .from("stripe_webhook_events")
    .update({
      type: event.type,
      status: "processing",
      attempts,
      payload,
      error_message: null,
      received_at: now,
      processed_at: null,
    })
    .eq("event_id", event.id);

  if (error) throw new Error(error.message);
  return true;
}

export async function markStripeEventProcessed(eventId: string) {
  await getAdminClient()
    .from("stripe_webhook_events")
    .update({ status: "processed", processed_at: new Date().toISOString(), error_message: null })
    .eq("event_id", eventId);
}

export async function markStripeEventFailed(eventId: string, error: unknown) {
  await getAdminClient()
    .from("stripe_webhook_events")
    .update({
      status: "failed",
      error_message: error instanceof Error ? error.message : String(error),
      processed_at: new Date().toISOString(),
    })
    .eq("event_id", eventId);
}

async function findOrderBy(column: string, value: string): Promise<BillingOrder | null> {
  const { data, error } = await getAdminClient()
    .from("payment_orders")
    .select("*")
    .eq(column, value)
    .maybeSingle();

  if (error || !data) return null;
  return orderRowToClient(data);
}

function productRowToClient(row: BillingProductRow, prices: BillingPrice[]): BillingProduct {
  return {
    id: stringValue(row.id),
    tierKey: stringValue(row.tier_key),
    kind: "credit_tier",
    name: stringValue(row.name),
    description: stringValue(row.description),
    badge: nullableString(row.badge),
    creditAmount: numberValue(row.credit_amount),
    bonusCredits: numberValue(row.bonus_credits),
    subscriptionBonusPercent: numberValue(row.subscription_bonus_percent) || 5,
    features: Array.isArray(row.features) ? row.features.map(String) : [],
    stripeProductId: nullableString(row.stripe_product_id),
    active: row.active !== false,
    sortOrder: numberValue(row.sort_order),
    prices,
  };
}

function priceRowToClient(row: BillingPriceRow): BillingPrice {
  const mode = stringValue(row.mode) === "subscription" ? "subscription" : "payment";
  return {
    id: stringValue(row.id),
    productId: stringValue(row.product_id),
    mode,
    label: stringValue(row.label) || (mode === "subscription" ? "月订阅" : "一次性购买"),
    unitAmount: numberValue(row.unit_amount),
    currency: "cny",
    interval: mode === "subscription" ? "month" : null,
    credits: numberValue(row.credits),
    stripePriceId: nullableString(row.stripe_price_id),
    active: row.active !== false,
    walletEnabled: row.wallet_enabled === true,
  };
}

function orderRowToClient(row: Record<string, unknown>): BillingOrder {
  return {
    id: stringValue(row.id),
    userId: stringValue(row.user_id),
    productId: stringValue(row.product_id),
    priceId: stringValue(row.price_id),
    mode: stringValue(row.mode) === "subscription" ? "subscription" : "payment",
    status: stringValue(row.status),
    amountTotal: numberValue(row.amount_total),
    amountRefunded: numberValue(row.amount_refunded),
    creditsExpected: numberValue(row.credits_expected),
    creditsGranted: numberValue(row.credits_granted),
    stripeCheckoutSessionId: nullableString(row.stripe_checkout_session_id),
    stripePaymentIntentId: nullableString(row.stripe_payment_intent_id),
    stripeInvoiceId: nullableString(row.stripe_invoice_id),
    stripeSubscriptionId: nullableString(row.stripe_subscription_id),
  };
}

export function stripeId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) return String((value as { id: unknown }).id);
  return null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function nullableString(value: unknown) {
  const text = stringValue(value);
  return text || null;
}

function numberValue(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function timestampToIso(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? new Date(num * 1000).toISOString() : null;
}

function isUniqueViolation(error: { code?: string; message?: string }) {
  return error.code === "23505" || (error.message || "").toLowerCase().includes("duplicate key");
}

function summarizeStripeEvent(event: Stripe.Event) {
  return {
    id: event.id,
    type: event.type,
    created: event.created,
    livemode: event.livemode,
    object: event.data.object?.object,
  };
}
