import { describe, expect, it } from "vitest";
import {
  calculateRefundCreditReversal,
  computeBillingCredits,
  planStripeWebhookCreditGrant,
  resolveCheckoutPrice,
  stripeOrderCredits,
  type BillingPriceSeed,
  type ProcessedStripeBillingState,
  type StripeBillingEvent,
} from "@/lib/billing";

// Contract tests for the Stripe billing pure-function surface. The
// implementation worker should export these names from "@/lib/billing".
const PRICE_SEEDS = [
  { lookupKey: "credits_250_once", priceId: "price_once_250", mode: "payment", baseCredits: 250 },
  { lookupKey: "credits_1200_once", priceId: "price_once_1200", mode: "payment", baseCredits: 1200 },
  { lookupKey: "credits_7000_once", priceId: "price_once_7000", mode: "payment", baseCredits: 7000 },
  { lookupKey: "credits_38000_once", priceId: "price_once_38000", mode: "payment", baseCredits: 38000 },
  { lookupKey: "credits_250_monthly", priceId: "price_monthly_250", mode: "subscription", baseCredits: 250 },
  { lookupKey: "credits_1200_monthly", priceId: "price_monthly_1200", mode: "subscription", baseCredits: 1200 },
  { lookupKey: "credits_7000_monthly", priceId: "price_monthly_7000", mode: "subscription", baseCredits: 7000 },
  { lookupKey: "credits_38000_monthly", priceId: "price_monthly_38000", mode: "subscription", baseCredits: 38000 },
] satisfies BillingPriceSeed[];

function priceSeed(lookupKey: string) {
  const seed = PRICE_SEEDS.find((item) => item.lookupKey === lookupKey);
  if (!seed) throw new Error(`Missing test price seed: ${lookupKey}`);
  return seed;
}

function paidCheckoutEvent(params: {
  eventId: string;
  sessionId: string;
  priceId: string;
  userId?: string;
}): StripeBillingEvent {
  return {
    id: params.eventId,
    type: "checkout.session.completed",
    data: {
      object: {
        id: params.sessionId,
        object: "checkout.session",
        mode: "payment",
        payment_status: "paid",
        client_reference_id: params.userId ?? "user_123",
        metadata: {
          userId: params.userId ?? "user_123",
          priceId: params.priceId,
        },
      },
    },
  };
}

describe("Stripe billing product seed entitlements", () => {
  it.each([
    ["credits_250_once", 250],
    ["credits_1200_once", 1200],
    ["credits_7000_once", 7000],
    ["credits_38000_once", 38000],
  ])("keeps one-time entitlement for %s at %i credits", (lookupKey, expectedCredits) => {
    expect(computeBillingCredits(priceSeed(lookupKey))).toBe(expectedCredits);
  });

  it.each([
    ["credits_250_monthly", 263],
    ["credits_1200_monthly", 1260],
    ["credits_7000_monthly", 7350],
    ["credits_38000_monthly", 39900],
  ])("adds the 5 percent monthly subscription bonus for %s", (lookupKey, expectedCredits) => {
    expect(computeBillingCredits(priceSeed(lookupKey))).toBe(expectedCredits);
  });
});

describe("Stripe checkout price resolution", () => {
  it("uses the local priceId catalog and ignores forged client amounts", () => {
    const checkout = resolveCheckoutPrice({
      catalog: PRICE_SEEDS,
      requestedPriceId: "price_once_1200",
      clientAmountCents: 1,
      clientCredits: 999999,
    });

    expect(checkout).toEqual(
      expect.objectContaining({
        priceId: "price_once_1200",
        mode: "payment",
        credits: 1200,
        stripeLineItem: { price: "price_once_1200", quantity: 1 },
      })
    );
    expect(checkout).not.toHaveProperty("amountCents");
    expect(checkout).not.toHaveProperty("unitAmount");
    expect(checkout).not.toHaveProperty("clientAmountCents");
    expect(checkout).not.toHaveProperty("clientCredits");
  });

  it("rejects unknown or missing priceId instead of accepting amount-only checkout", () => {
    expect(() =>
      resolveCheckoutPrice({
        catalog: PRICE_SEEDS,
        requestedPriceId: "price_not_in_catalog",
        clientAmountCents: 1200,
      })
    ).toThrow(/price/i);

    expect(() =>
      resolveCheckoutPrice({
        catalog: PRICE_SEEDS,
        clientAmountCents: 1200,
      })
    ).toThrow(/priceId/i);
  });
});

describe("Stripe order credit policy", () => {
  it("keeps Stripe order credit grants disabled by default", () => {
    expect(stripeOrderCredits(1200, {})).toBe(0);
  });

  it("can be explicitly enabled for real credit fulfillment", () => {
    expect(stripeOrderCredits(1200, { STRIPE_ENABLE_CREDIT_GRANTS: "true" })).toBe(1200);
  });
});

describe("Stripe webhook credit grants", () => {
  it("skips exact replayed event ids and duplicate checkout session grants", () => {
    const initialState: ProcessedStripeBillingState = {
      processedEventIds: [],
      creditedLedgerKeys: [],
    };
    const firstEvent = paidCheckoutEvent({
      eventId: "evt_checkout_completed_1",
      sessionId: "cs_test_123",
      priceId: "price_once_1200",
    });

    const firstPlan = planStripeWebhookCreditGrant({
      catalog: PRICE_SEEDS,
      event: firstEvent,
      state: initialState,
    });

    expect(firstPlan).toEqual(
      expect.objectContaining({
        action: "grant",
        userId: "user_123",
        creditsDelta: 1200,
        ledgerKey: "checkout.session:cs_test_123",
      })
    );
    expect(firstPlan.nextState.processedEventIds).toContain("evt_checkout_completed_1");
    expect(firstPlan.nextState.creditedLedgerKeys).toContain("checkout.session:cs_test_123");

    const exactReplay = planStripeWebhookCreditGrant({
      catalog: PRICE_SEEDS,
      event: firstEvent,
      state: firstPlan.nextState,
    });

    expect(exactReplay).toEqual(
      expect.objectContaining({
        action: "skip",
        reason: "processed_event",
        creditsDelta: 0,
      })
    );

    const duplicateSession = planStripeWebhookCreditGrant({
      catalog: PRICE_SEEDS,
      event: paidCheckoutEvent({
        eventId: "evt_checkout_completed_2",
        sessionId: "cs_test_123",
        priceId: "price_once_1200",
      }),
      state: firstPlan.nextState,
    });

    expect(duplicateSession).toEqual(
      expect.objectContaining({
        action: "skip",
        reason: "credited_ledger",
        creditsDelta: 0,
      })
    );
  });
});

describe("Stripe refund credit reversal", () => {
  it("deducts granted credits when the available balance is sufficient", () => {
    const reversal = calculateRefundCreditReversal({
      availableCredits: 1000,
      creditsToReverse: 250,
      purchaseLedgerKey: "checkout.session:cs_test_250",
      refundId: "re_test_full",
    });

    expect(reversal).toEqual(
      expect.objectContaining({
        creditsToDeduct: 250,
        endingBalance: 750,
        lostCredits: 0,
        lossRecord: null,
      })
    );
    expect(reversal.creditLog).toEqual(
      expect.objectContaining({
        amount: -250,
        balance: 750,
        sourceId: "re_test_full",
        sourceType: "stripe_refund",
      })
    );
  });

  it("never drives the balance negative and records unrecoverable credit loss", () => {
    const reversal = calculateRefundCreditReversal({
      availableCredits: 80,
      creditsToReverse: 250,
      purchaseLedgerKey: "checkout.session:cs_test_250",
      refundId: "re_test_partial_loss",
    });

    expect(reversal).toEqual(
      expect.objectContaining({
        creditsToDeduct: 80,
        endingBalance: 0,
        lostCredits: 170,
      })
    );
    expect(reversal.creditLog).toEqual(
      expect.objectContaining({
        amount: -80,
        balance: 0,
        sourceId: "re_test_partial_loss",
        sourceType: "stripe_refund",
      })
    );
    expect(reversal.lossRecord).toEqual(
      expect.objectContaining({
        lostCredits: 170,
        purchaseLedgerKey: "checkout.session:cs_test_250",
        refundId: "re_test_partial_loss",
        reason: "insufficient_credit_balance",
      })
    );
  });
});
