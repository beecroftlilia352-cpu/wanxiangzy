import {
  findOrderByPaymentIntent,
  markOrderRefunded,
  reverseOrderCredits,
  type BillingOrder,
} from "@/lib/billing/repository";

export async function applyStripeRefundToOrder(params: {
  paymentIntentId: string;
  cumulativeAmountRefunded: number;
  reason: string;
}) {
  const order = await findOrderByPaymentIntent(params.paymentIntentId);
  if (!order) return null;
  return applyRefundToOrder({
    order,
    cumulativeAmountRefunded: params.cumulativeAmountRefunded,
    reason: params.reason,
  });
}

export async function applyRefundToOrder(params: {
  order: BillingOrder;
  cumulativeAmountRefunded: number;
  reason: string;
}) {
  const amountTotal = Math.max(0, params.order.amountTotal);
  const previousRefunded = Math.max(0, params.order.amountRefunded);
  const nextRefunded = Math.min(amountTotal, Math.max(previousRefunded, Math.floor(params.cumulativeAmountRefunded)));
  const refundDelta = Math.max(0, nextRefunded - previousRefunded);
  const fullyRefunded = amountTotal > 0 && nextRefunded >= amountTotal;

  await markOrderRefunded({
    orderId: params.order.id,
    amountRefunded: nextRefunded,
    fullyRefunded,
  });

  if (refundDelta <= 0 || params.order.creditsGranted <= 0 || amountTotal <= 0) {
    return {
      orderId: params.order.id,
      amountRefunded: nextRefunded,
      refundDelta,
      creditsReversed: 0,
    };
  }

  const credits = fullyRefunded
    ? null
    : Math.max(1, Math.round(params.order.creditsGranted * (refundDelta / amountTotal)));

  await reverseOrderCredits({
    orderId: params.order.id,
    credits,
    reason: params.reason,
  });

  return {
    orderId: params.order.id,
    amountRefunded: nextRefunded,
    refundDelta,
    creditsReversed: credits ?? params.order.creditsGranted,
  };
}
