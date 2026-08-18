import type { AdminMetric } from "./shared";

export const BILLING_PRODUCTS_TABLE = "billing_products";
export const BILLING_PRICES_TABLE = "billing_prices";
export const BILLING_ORDERS_TABLE = "payment_orders";
export const BILLING_SUBSCRIPTIONS_TABLE = "stripe_subscriptions";
export const BILLING_WEBHOOK_EVENTS_TABLE = "stripe_webhook_events";

export type AdminBillingProduct = {
  id: string;
  stripeProductId: string;
  name: string;
  description: string | null;
  tierKey: string | null;
  creditAmount: number;
  bonusCredits: number;
  active: boolean;
  metadata: Record<string, unknown>;
  createdAt: string | null;
  updatedAt: string | null;
};

export type AdminBillingPrice = {
  id: string;
  stripePriceId: string;
  stripeProductId: string;
  productName: string | null;
  nickname: string | null;
  currency: string;
  unitAmount: number;
  recurringInterval: string | null;
  recurringIntervalCount: number;
  type: string;
  active: boolean;
  credits: number;
  createdAt: string | null;
};

export type AdminBillingOrder = {
  id: string;
  userId: string | null;
  email: string | null;
  stripeCustomerId: string | null;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  amountTotal: number;
  currency: string;
  status: string;
  refundedAmount: number;
  creditsGranted: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type AdminBillingSubscription = {
  id: string;
  userId: string | null;
  email: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string;
  stripePriceId: string | null;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type AdminBillingWebhookEvent = {
  id: string;
  stripeEventId: string;
  type: string;
  status: string;
  attempts: number;
  errorMessage: string | null;
  createdAt: string | null;
  processedAt: string | null;
};

export type AdminBillingConfigStatus = {
  key: string;
  label: string;
  configured: boolean;
  scope: "env" | "table";
  statusHint: string;
};

export type AdminBillingOverview = {
  available: boolean;
  summarySource: "rpc" | "sample";
  metrics: AdminMetric[];
  products: AdminBillingProduct[];
  prices: AdminBillingPrice[];
  orders: AdminBillingOrder[];
  subscriptions: AdminBillingSubscription[];
  webhookEvents: AdminBillingWebhookEvent[];
  configStatus: AdminBillingConfigStatus[];
  warnings: string[];
};
