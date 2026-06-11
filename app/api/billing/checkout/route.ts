import { NextResponse } from "next/server";
import { getCheckoutPriceBundle, createPaymentOrder, attachCheckoutSessionToOrder, ensureStripePrice, getOrCreateStripeCustomer } from "@/lib/billing/repository";
import { getAppUrl, getStripe } from "@/lib/billing/stripe";
import { createServerSupabase } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({})) as { priceId?: unknown };
    const priceId = typeof body.priceId === "string" ? body.priceId.trim() : "";
    if (!priceId) {
      return NextResponse.json({ error: "priceId is required" }, { status: 400 });
    }

    const bundle = await getCheckoutPriceBundle(priceId);
    if (!bundle || !bundle.price.active || !bundle.product.active) {
      return NextResponse.json({ error: "套餐不可用" }, { status: 404 });
    }

    const stripe = getStripe();
    const stripeCustomerId = await getOrCreateStripeCustomer({
      userId: user.id,
      email: user.email,
      stripe,
    });
    const stripePriceId = await ensureStripePrice({ stripe, product: bundle.product, price: bundle.price });
    const orderId = await createPaymentOrder({
      userId: user.id,
      product: bundle.product,
      price: bundle.price,
      stripeCustomerId,
    });

    const appUrl = getAppUrl();
    const metadata = {
      orderId,
      userId: user.id,
      productId: bundle.product.id,
      priceId: bundle.price.id,
      credits: String(bundle.price.credits),
      mode: bundle.price.mode,
    };

    const session = await stripe.checkout.sessions.create({
      mode: bundle.price.mode,
      customer: stripeCustomerId,
      client_reference_id: user.id,
      line_items: [{ price: stripePriceId, quantity: 1 }],
      payment_method_types: bundle.price.mode === "payment" ? ["card", "alipay", "wechat_pay"] : ["card"],
      payment_method_options: bundle.price.mode === "payment"
        ? { wechat_pay: { client: "web" } }
        : undefined,
      allow_promotion_codes: true,
      locale: "zh",
      success_url: `${appUrl}/pricing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/pricing?checkout=cancelled`,
      metadata,
      payment_intent_data: bundle.price.mode === "payment" ? { metadata } : undefined,
      subscription_data: bundle.price.mode === "subscription" ? { metadata } : undefined,
    });

    await attachCheckoutSessionToOrder({ orderId, session });

    if (!session.url) {
      return NextResponse.json({ error: "Stripe Checkout URL 创建失败" }, { status: 502 });
    }

    return NextResponse.json(
      { url: session.url, orderId },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[billing/checkout] error:", error);
    }
    const message = error instanceof Error ? error.message : "创建支付会话失败";
    const status = message.includes("billing_") || message.includes("payment_orders") ? 501 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
