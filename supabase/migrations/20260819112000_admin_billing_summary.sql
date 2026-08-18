-- Exact Billing control-plane totals. The admin UI may load a bounded sample for
-- tables, but financial and fulfilment KPIs must be aggregated in Postgres.
CREATE OR REPLACE FUNCTION public.get_admin_billing_summary()
RETURNS TABLE (
  active_products BIGINT,
  active_prices BIGINT,
  paid_orders BIGINT,
  net_revenue BIGINT,
  active_subscriptions BIGINT,
  webhook_issues BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    (SELECT count(*)
       FROM public.billing_products
      WHERE active = TRUE),
    (SELECT count(*)
       FROM public.billing_prices
      WHERE active = TRUE),
    (SELECT count(*)
       FROM public.payment_orders
      WHERE lower(status) IN ('paid', 'succeeded', 'complete', 'completed')),
    (SELECT coalesce(sum(greatest(amount_total - amount_refunded, 0)), 0)::BIGINT
       FROM public.payment_orders
      WHERE lower(status) IN ('paid', 'succeeded', 'complete', 'completed')),
    (SELECT count(*)
       FROM public.stripe_subscriptions
      WHERE lower(status) IN ('active', 'trialing')),
    (SELECT count(*)
       FROM public.stripe_webhook_events
      WHERE lower(status) IN ('failed', 'error', 'retrying'));
$$;

REVOKE ALL ON FUNCTION public.get_admin_billing_summary()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_billing_summary()
  TO service_role;
