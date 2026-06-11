-- ============================================================
-- Stripe billing, credit purchases, and subscriptions
-- Run after schema.sql, credits-update.sql, and admin-console.sql.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.billing_products (
  id TEXT PRIMARY KEY,
  tier_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'credit_tier'
    CHECK (kind IN ('credit_tier')),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  badge TEXT,
  credit_amount INTEGER NOT NULL DEFAULT 0,
  bonus_credits INTEGER NOT NULL DEFAULT 0,
  subscription_bonus_percent NUMERIC(5,2) NOT NULL DEFAULT 5,
  features TEXT[] NOT NULL DEFAULT '{}',
  stripe_product_id TEXT UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.billing_prices (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES public.billing_products(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('payment', 'subscription')),
  label TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'cny',
  unit_amount INTEGER NOT NULL CHECK (unit_amount > 0),
  interval TEXT CHECK (interval IS NULL OR interval IN ('month')),
  credits INTEGER NOT NULL CHECK (credits > 0),
  stripe_price_id TEXT UNIQUE,
  wallet_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stripe_customers (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  stripe_customer_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES public.billing_products(id),
  price_id TEXT NOT NULL REFERENCES public.billing_prices(id),
  mode TEXT NOT NULL CHECK (mode IN ('payment', 'subscription')),
  status TEXT NOT NULL DEFAULT 'checkout_created'
    CHECK (status IN (
      'checkout_created',
      'checkout_open',
      'pending',
      'paid',
      'failed',
      'cancelled',
      'refunded',
      'partially_refunded'
    )),
  currency TEXT NOT NULL DEFAULT 'cny',
  amount_total INTEGER NOT NULL DEFAULT 0,
  amount_refunded INTEGER NOT NULL DEFAULT 0,
  credits_expected INTEGER NOT NULL DEFAULT 0,
  credits_granted INTEGER NOT NULL DEFAULT 0,
  credits_reversed INTEGER NOT NULL DEFAULT 0,
  refund_loss_credits INTEGER NOT NULL DEFAULT 0,
  credit_grant_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (credit_grant_status IN ('pending', 'granted', 'partially_reversed', 'reversed')),
  stripe_customer_id TEXT,
  stripe_checkout_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT,
  stripe_invoice_id TEXT UNIQUE,
  stripe_subscription_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stripe_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES public.billing_products(id),
  price_id TEXT REFERENCES public.billing_prices(id),
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  stripe_customer_id TEXT,
  status TEXT NOT NULL,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  latest_invoice_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'processed', 'failed', 'ignored')),
  attempts INTEGER NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

ALTER TABLE public.stripe_webhook_events
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS billing_products_active_idx
  ON public.billing_products(active, sort_order);
CREATE INDEX IF NOT EXISTS billing_prices_product_mode_idx
  ON public.billing_prices(product_id, mode, active);
CREATE INDEX IF NOT EXISTS payment_orders_user_created_idx
  ON public.payment_orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_orders_status_created_idx
  ON public.payment_orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS stripe_subscriptions_user_status_idx
  ON public.stripe_subscriptions(user_id, status);
CREATE INDEX IF NOT EXISTS stripe_webhook_events_status_idx
  ON public.stripe_webhook_events(status, received_at DESC);

ALTER TABLE public.billing_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active billing products" ON public.billing_products;
CREATE POLICY "Anyone can view active billing products"
  ON public.billing_products FOR SELECT
  USING (active = TRUE);

DROP POLICY IF EXISTS "Anyone can view active billing prices" ON public.billing_prices;
CREATE POLICY "Anyone can view active billing prices"
  ON public.billing_prices FOR SELECT
  USING (active = TRUE);

DROP POLICY IF EXISTS "Users can view own payment orders" ON public.payment_orders;
CREATE POLICY "Users can view own payment orders"
  ON public.payment_orders FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own stripe subscriptions" ON public.stripe_subscriptions;
CREATE POLICY "Users can view own stripe subscriptions"
  ON public.stripe_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

ALTER TABLE public.credit_logs
  ADD COLUMN IF NOT EXISTS payment_order_id UUID REFERENCES public.payment_orders(id),
  ADD COLUMN IF NOT EXISTS billing_source TEXT,
  ADD COLUMN IF NOT EXISTS billing_source_id TEXT;

INSERT INTO public.billing_products
  (id, tier_key, name, description, badge, credit_amount, bonus_credits, subscription_bonus_percent, features, sort_order)
VALUES
  ('prod_starter', 'starter', '入门版', '适合轻量试用和小批量出图。', NULL, 250, 0, 5, ARRAY['250 积分', '适合体验核心生成能力', '支持所有基础模块'], 1),
  ('prod_pro', 'pro', '专业版', '适合稳定日常生产。', '热门', 1000, 200, 5, ARRAY['1,000 积分 + 赠送 200', '适合多模块连续生成', '更高性价比'], 2),
  ('prod_business', 'business', '企业版', '适合团队批量生成和电商素材生产。', '推荐', 5000, 2000, 5, ARRAY['5,000 积分 + 赠送 2,000', '适合批量商品套图', '团队运营更稳'], 3),
  ('prod_premium', 'premium', '豪华版', '适合高频生产和大规模素材工作流。', NULL, 25000, 13000, 5, ARRAY['25,000 积分 + 赠送 13,000', '适合高频生成', '最佳单积分成本'], 4)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  badge = EXCLUDED.badge,
  credit_amount = EXCLUDED.credit_amount,
  bonus_credits = EXCLUDED.bonus_credits,
  subscription_bonus_percent = EXCLUDED.subscription_bonus_percent,
  features = EXCLUDED.features,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

INSERT INTO public.billing_prices
  (id, product_id, mode, label, currency, unit_amount, interval, credits, wallet_enabled, sort_order)
VALUES
  ('price_starter_once', 'prod_starter', 'payment', '一次性购买', 'cny', 3500, NULL, 250, TRUE, 1),
  ('price_starter_monthly', 'prod_starter', 'subscription', '月订阅', 'cny', 3500, 'month', 263, FALSE, 2),
  ('price_pro_once', 'prod_pro', 'payment', '一次性购买', 'cny', 14000, NULL, 1200, TRUE, 1),
  ('price_pro_monthly', 'prod_pro', 'subscription', '月订阅', 'cny', 14000, 'month', 1260, FALSE, 2),
  ('price_business_once', 'prod_business', 'payment', '一次性购买', 'cny', 70000, NULL, 7000, TRUE, 1),
  ('price_business_monthly', 'prod_business', 'subscription', '月订阅', 'cny', 70000, 'month', 7350, FALSE, 2),
  ('price_premium_once', 'prod_premium', 'payment', '一次性购买', 'cny', 350000, NULL, 38000, TRUE, 1),
  ('price_premium_monthly', 'prod_premium', 'subscription', '月订阅', 'cny', 350000, 'month', 39900, FALSE, 2)
ON CONFLICT (id) DO UPDATE SET
  product_id = EXCLUDED.product_id,
  mode = EXCLUDED.mode,
  label = EXCLUDED.label,
  currency = EXCLUDED.currency,
  unit_amount = EXCLUDED.unit_amount,
  interval = EXCLUDED.interval,
  credits = EXCLUDED.credits,
  wallet_enabled = EXCLUDED.wallet_enabled,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.grant_billing_order_credits(
  p_order_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE(user_id UUID, balance INTEGER, credits_granted INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.payment_orders%ROWTYPE;
  v_balance INTEGER;
  v_reason TEXT;
BEGIN
  SELECT * INTO v_order
  FROM public.payment_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment order not found';
  END IF;

  IF v_order.credit_grant_status = 'granted' THEN
    SELECT credits INTO v_balance FROM public.profiles WHERE id = v_order.user_id;
    user_id := v_order.user_id;
    balance := COALESCE(v_balance, 0);
    credits_granted := v_order.credits_granted;
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_order.credits_expected <= 0 THEN
    RAISE EXCEPTION 'invalid credits_expected';
  END IF;

  UPDATE public.profiles
  SET credits = COALESCE(credits, 0) + v_order.credits_expected,
      updated_at = now()
  WHERE id = v_order.user_id
  RETURNING credits INTO v_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found';
  END IF;

  v_reason := LEFT(COALESCE(NULLIF(TRIM(p_reason), ''), 'Stripe 支付入账'), 240);

  INSERT INTO public.credit_logs(
    user_id,
    amount,
    balance,
    reason,
    payment_order_id,
    billing_source,
    billing_source_id
  )
  VALUES (
    v_order.user_id,
    v_order.credits_expected,
    v_balance,
    v_reason,
    v_order.id,
    'stripe_payment',
    COALESCE(v_order.stripe_checkout_session_id, v_order.stripe_invoice_id, v_order.id::TEXT)
  );

  UPDATE public.payment_orders
  SET status = 'paid',
      credits_granted = v_order.credits_expected,
      credit_grant_status = 'granted',
      updated_at = now()
  WHERE id = v_order.id;

  user_id := v_order.user_id;
  balance := v_balance;
  credits_granted := v_order.credits_expected;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_billing_order_credits(
  p_order_id UUID,
  p_requested_credits INTEGER DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE(
  user_id UUID,
  balance INTEGER,
  credits_deducted INTEGER,
  lost_credits INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.payment_orders%ROWTYPE;
  v_available INTEGER;
  v_remaining INTEGER;
  v_target INTEGER;
  v_deduct INTEGER;
  v_lost INTEGER;
  v_balance INTEGER;
  v_reason TEXT;
BEGIN
  SELECT * INTO v_order
  FROM public.payment_orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment order not found';
  END IF;

  v_remaining := GREATEST(COALESCE(v_order.credits_granted, 0) - COALESCE(v_order.credits_reversed, 0), 0);
  v_target := LEAST(v_remaining, COALESCE(NULLIF(p_requested_credits, 0), v_remaining));

  IF v_target <= 0 THEN
    SELECT credits INTO v_balance FROM public.profiles WHERE id = v_order.user_id;
    user_id := v_order.user_id;
    balance := COALESCE(v_balance, 0);
    credits_deducted := 0;
    lost_credits := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT COALESCE(credits, 0) INTO v_available
  FROM public.profiles
  WHERE id = v_order.user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found';
  END IF;

  v_deduct := LEAST(v_available, v_target);
  v_lost := GREATEST(v_target - v_deduct, 0);
  v_reason := LEFT(COALESCE(NULLIF(TRIM(p_reason), ''), 'Stripe 退款扣回积分'), 240);

  IF v_deduct > 0 THEN
    UPDATE public.profiles
    SET credits = GREATEST(COALESCE(credits, 0) - v_deduct, 0),
        updated_at = now()
    WHERE id = v_order.user_id
    RETURNING credits INTO v_balance;

    INSERT INTO public.credit_logs(
      user_id,
      amount,
      balance,
      reason,
      payment_order_id,
      billing_source,
      billing_source_id
    )
    VALUES (
      v_order.user_id,
      -v_deduct,
      v_balance,
      v_reason,
      v_order.id,
      'stripe_refund',
      COALESCE(v_order.stripe_payment_intent_id, v_order.stripe_invoice_id, v_order.id::TEXT)
    );
  ELSE
    v_balance := v_available;
  END IF;

  UPDATE public.payment_orders
  SET credits_reversed = COALESCE(credits_reversed, 0) + v_deduct,
      refund_loss_credits = COALESCE(refund_loss_credits, 0) + v_lost,
      credit_grant_status = CASE
        WHEN COALESCE(credits_reversed, 0) + v_deduct >= COALESCE(credits_granted, 0) THEN 'reversed'
        ELSE 'partially_reversed'
      END,
      updated_at = now()
  WHERE id = v_order.id;

  user_id := v_order.user_id;
  balance := v_balance;
  credits_deducted := v_deduct;
  lost_credits := v_lost;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_billing_order_credits(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reverse_billing_order_credits(UUID, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_billing_order_credits(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.reverse_billing_order_credits(UUID, INTEGER, TEXT) TO service_role;
