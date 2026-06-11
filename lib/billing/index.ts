import { subscriptionCreditsFor } from "@/lib/billing/catalog";

export type BillingPriceSeed = {
  lookupKey: string;
  priceId: string;
  mode: "payment" | "subscription";
  baseCredits: number;
};

export type StripeBillingEvent = {
  id: string;
  type: string;
  data: {
    object: {
      id?: string;
      object?: string;
      mode?: string;
      payment_status?: string;
      client_reference_id?: string | null;
      metadata?: Record<string, string | undefined> | null;
    };
  };
};

export type ProcessedStripeBillingState = {
  processedEventIds: string[];
  creditedLedgerKeys: string[];
};

type ResolveCheckoutPriceInput = {
  catalog: BillingPriceSeed[];
  requestedPriceId?: string;
  clientAmountCents?: number;
  clientCredits?: number;
};

type CreditGrantPlanInput = {
  catalog: BillingPriceSeed[];
  event: StripeBillingEvent;
  state: ProcessedStripeBillingState;
};

type RefundCreditReversalInput = {
  availableCredits: number;
  creditsToReverse: number;
  purchaseLedgerKey: string;
  refundId: string;
};

export function computeBillingCredits(seed: BillingPriceSeed) {
  return seed.mode === "subscription" ? subscriptionCreditsFor(seed.baseCredits) : seed.baseCredits;
}

export function resolveCheckoutPrice(input: ResolveCheckoutPriceInput) {
  if (!input.requestedPriceId) {
    throw new Error("priceId is required");
  }

  const price = input.catalog.find((item) => item.priceId === input.requestedPriceId);
  if (!price) {
    throw new Error(`Unknown priceId: ${input.requestedPriceId}`);
  }

  return {
    priceId: price.priceId,
    mode: price.mode,
    credits: computeBillingCredits(price),
    stripeLineItem: { price: price.priceId, quantity: 1 },
  };
}

export function planStripeWebhookCreditGrant(input: CreditGrantPlanInput) {
  if (input.state.processedEventIds.includes(input.event.id)) {
    return skipCreditGrant(input.state, "processed_event");
  }

  const session = input.event.data.object;
  if (input.event.type !== "checkout.session.completed" || session.payment_status !== "paid") {
    return {
      action: "skip" as const,
      reason: "unsupported_event",
      creditsDelta: 0,
      nextState: nextProcessedState(input.state, input.event.id),
    };
  }

  const ledgerKey = `checkout.session:${session.id || ""}`;
  if (input.state.creditedLedgerKeys.includes(ledgerKey)) {
    return skipCreditGrant(nextProcessedState(input.state, input.event.id), "credited_ledger");
  }

  const priceId = session.metadata?.priceId;
  const price = input.catalog.find((item) => item.priceId === priceId);
  if (!price) {
    return {
      action: "skip" as const,
      reason: "unknown_price",
      creditsDelta: 0,
      nextState: nextProcessedState(input.state, input.event.id),
    };
  }

  const nextState = nextProcessedState(input.state, input.event.id);
  nextState.creditedLedgerKeys = unique([...nextState.creditedLedgerKeys, ledgerKey]);

  return {
    action: "grant" as const,
    userId: session.metadata?.userId || session.client_reference_id || "",
    creditsDelta: computeBillingCredits(price),
    ledgerKey,
    nextState,
  };
}

export function calculateRefundCreditReversal(input: RefundCreditReversalInput) {
  const availableCredits = Math.max(0, Math.floor(input.availableCredits));
  const creditsToReverse = Math.max(0, Math.floor(input.creditsToReverse));
  const creditsToDeduct = Math.min(availableCredits, creditsToReverse);
  const endingBalance = availableCredits - creditsToDeduct;
  const lostCredits = Math.max(0, creditsToReverse - creditsToDeduct);

  return {
    creditsToDeduct,
    endingBalance,
    lostCredits,
    creditLog: creditsToDeduct > 0
      ? {
          amount: -creditsToDeduct,
          balance: endingBalance,
          sourceId: input.refundId,
          sourceType: "stripe_refund",
          reason: "Stripe refund credit reversal",
        }
      : null,
    lossRecord: lostCredits > 0
      ? {
          lostCredits,
          purchaseLedgerKey: input.purchaseLedgerKey,
          refundId: input.refundId,
          reason: "insufficient_credit_balance",
        }
      : null,
  };
}

function skipCreditGrant(state: ProcessedStripeBillingState, reason: "processed_event" | "credited_ledger") {
  return {
    action: "skip" as const,
    reason,
    creditsDelta: 0,
    nextState: state,
  };
}

function nextProcessedState(state: ProcessedStripeBillingState, eventId: string): ProcessedStripeBillingState {
  return {
    processedEventIds: unique([...state.processedEventIds, eventId]),
    creditedLedgerKeys: unique(state.creditedLedgerKeys),
  };
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

export * from "@/lib/billing/catalog";
export * from "@/lib/billing/credit-policy";
