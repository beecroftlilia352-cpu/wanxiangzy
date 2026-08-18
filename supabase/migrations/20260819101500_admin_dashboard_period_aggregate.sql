-- Exact, bounded-period aggregates for the admin operating dashboard.
-- Keep this in Postgres so the dashboard does not silently become a 300-row sample
-- when the generation or credit-log tables grow beyond the UI query limit.
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_period(p_since timestamptz)
RETURNS TABLE (
  total_generations BIGINT,
  completed_generations BIGINT,
  failed_generations BIGINT,
  credits_spent BIGINT,
  credits_refunded BIGINT,
  new_users BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    (SELECT count(*)
       FROM public.generations
      WHERE created_at >= p_since),
    (SELECT count(*)
       FROM public.generations
      WHERE created_at >= p_since
        AND lower(coalesce(status, '')) = 'completed'),
    (SELECT count(*)
       FROM public.generations
      WHERE created_at >= p_since
        AND lower(coalesce(status, '')) = 'failed'),
    (SELECT coalesce(sum(greatest(coalesce(credits_cost, 0), 0)), 0)::BIGINT
       FROM public.generations
      WHERE created_at >= p_since
        AND lower(coalesce(status, '')) = 'completed'),
    (SELECT coalesce(sum(greatest(coalesce(amount, 0), 0)), 0)::BIGINT
       FROM public.credit_logs
      WHERE created_at >= p_since
        AND amount > 0
        AND (
          lower(coalesce(reason, '')) LIKE '%退款%'
          OR lower(coalesce(reason, '')) LIKE '%退回%'
          OR lower(coalesce(reason, '')) LIKE '%refund%'
          OR lower(coalesce(reason, '')) LIKE '%failed%'
        )),
    (SELECT count(*)
       FROM public.profiles
      WHERE created_at >= p_since);
$$;

REVOKE ALL ON FUNCTION public.get_admin_dashboard_period(timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_period(timestamptz)
  TO service_role;
