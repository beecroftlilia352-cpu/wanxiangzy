import type Stripe from "stripe";
import {
  claimStripeEvent,
  createInvoiceOrder,
  findBundleByStripePrice,
  findOrderById,
  findOrderByCheckoutSession,
  findUserIdByStripeCustomer,
  grantOrderCredits,
  markOrderCreditGrantSkipped,
  markOrderFromCheckoutSession,
  markStripeEventFailed,
  markStripeEventProcessed,
  stripeId,
  upsertStripeSubscription,
} from "@/lib/billing/repository";
import { applyStripeRefundToOrder } from "@/lib/billing/refunds";
import { getStripe } from "@/lib/billing/stripe";

export async function processStripeEvent(event: Stripe.Event, options: { force?: boolean } = {}) {
  const claimed = await claimStripeEvent(event, { force: options.force });
  if (!claimed) return { received: true, duplicate: true };

  try {
    await handleStripeEvent(event);
    await markStripeEventProcessed(event.id);
    return { received: true, duplicate: false };
  } catch (error) {
    await markStripeEventFailed(event.id, error);
    throw error;
  }
}

async function handleStripeEvent(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await handleCheckoutSession(event.data.object as Stripe.Checkout.Session);
      return;
    case "checkout.session.async_payment_failed":
      await markOrderFromCheckoutSession(event.data.object as Stripe.Checkout.Session, "failed");
      return;
    case "invoice.paid":
      await handleInvoicePaid(event.data.object as Stripe.Invoice);
      return;
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
      return;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await handleSubscription(event.data.object as Stripe.Subscription);
      return;
    case "charge.refunded":
      await handleChargeRefunded(event.data.object as Stripe.Charge);
      return;
    case "refund.updated":
      await handleRefundUpdated(event.data.object as Stripe.Refund);
      return;
    case "refund.failed":
      return;
    default:
      return;
  }
}

async function handleCheckoutSession(session: Stripe.Checkout.Session) {
  const paid = session.payment_status === "paid";
  await markOrderFromCheckoutSession(session, paid ? "paid" : "pending");

  if (session.mode === "payment" && paid) {
    const order = await findOrderByCheckoutSession(session.id);
    if (!order) throw new Error(`Payment order not found for Checkout session ${session.id}`);
    if (order.creditsExpected <= 0) {
      await markOrderCreditGrantSkipped(order.id);
      return;
    }
    await grantOrderCredits(order.id, `Stripe 支付入账：${session.id}`);
  }

  const subscriptionId = stripeId(session.subscription);
  if (session.mode === "subscription" && subscriptionId) {
    const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
    await handleSubscription(subscription);
  }
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const invoiceAny = invoice as unknown as {
    subscription?: string | Stripe.Subscription | null;
    customer?: string | Stripe.Customer | null;
  };
  const subscriptionId = stripeId(invoiceAny.subscription);
  const customerId = stripeId(invoiceAny.customer);
  if (!subscriptionId || !customerId || !invoice.id) return;

  const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
  await handleSubscription(subscription);

  const userId = await findUserIdByStripeCustomer(customerId);
  if (!userId) throw new Error(`No user for Stripe customer ${customerId}`);

  const stripePriceId = subscription.items.data[0]?.price?.id;
  if (!stripePriceId) throw new Error(`No price on subscription ${subscription.id}`);

  const orderId = await createInvoiceOrder({
    userId,
    subscriptionId: subscription.id,
    invoiceId: invoice.id,
    stripeCustomerId: customerId,
    stripePriceId,
  });

  const order = await findOrderById(orderId);
  if (order && order.creditsExpected <= 0) {
    await markOrderCreditGrantSkipped(orderId);
    return;
  }

  await grantOrderCredits(orderId, `Stripe 订阅入账：${invoice.id}`);
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const invoiceAny = invoice as unknown as { subscription?: string | Stripe.Subscription | null };
  const subscriptionId = stripeId(invoiceAny.subscription);
  if (!subscriptionId) return;
  const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
  await handleSubscription(subscription);
}

async function handleSubscription(subscription: Stripe.Subscription) {
  const customerId = stripeId(subscription.customer);
  if (!customerId) return;

  const userId = await findUserIdByStripeCustomer(customerId);
  if (!userId) return;

  const stripePriceId = subscription.items.data[0]?.price?.id || "";
  const bundle = stripePriceId ? await findBundleByStripePrice(stripePriceId) : null;

  await upsertStripeSubscription({
    userId,
    subscription,
    productId: bundle?.product.id || null,
    priceId: bundle?.price.id || null,
  });
}

async function handleChargeRefunded(charge: Stripe.Charge) {
  const paymentIntentId = stripeId(charge.payment_intent);
  if (!paymentIntentId) return;

  await applyStripeRefundToOrder({
    paymentIntentId,
    cumulativeAmountRefunded: typeof charge.amount_refunded === "number" ? charge.amount_refunded : 0,
    reason: `Stripe 退款扣回积分：${charge.id}`,
  });
}

async function handleRefundUpdated(refund: Stripe.Refund) {
  if (refund.status !== "succeeded") return;

  const chargeId = stripeId(refund.charge);
  const directPaymentIntentId = stripeId((refund as unknown as { payment_intent?: unknown }).payment_intent);
  if (directPaymentIntentId && !chargeId) {
    await applyStripeRefundToOrder({
      paymentIntentId: directPaymentIntentId,
      cumulativeAmountRefunded: refund.amount,
      reason: `Stripe 退款确认扣回积分：${refund.id}`,
    });
    return;
  }

  if (!chargeId) return;
  const charge = await getStripe().charges.retrieve(chargeId);
  const paymentIntentId = stripeId(charge.payment_intent);
  if (!paymentIntentId) return;

  await applyStripeRefundToOrder({
    paymentIntentId,
    cumulativeAmountRefunded: typeof charge.amount_refunded === "number" ? charge.amount_refunded : refund.amount,
    reason: `Stripe 退款确认扣回积分：${refund.id}`,
  });
}
