-- Unified AI routing runtime: versioned publish, per-deployment health,
-- sanitized attempts and aggregate operational metrics.
CREATE TABLE IF NOT EXISTS public.ai_provider_health (
  deployment_id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  circuit_state TEXT NOT NULL DEFAULT 'closed'
    CHECK (circuit_state IN ('closed', 'open', 'half_open')),
  consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  sample_count BIGINT NOT NULL DEFAULT 0 CHECK (sample_count >= 0),
  ewma_success_rate DOUBLE PRECISION NOT NULL DEFAULT 1 CHECK (ewma_success_rate BETWEEN 0 AND 1),
  ewma_latency_ms DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (ewma_latency_ms >= 0),
  opened_until TIMESTAMPTZ,
  rate_limited_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_route_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL,
  generation_id UUID REFERENCES public.generations(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  model_id TEXT NOT NULL,
  modality TEXT NOT NULL,
  deployment_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  upstream_model TEXT NOT NULL,
  routing_mode TEXT NOT NULL CHECK (routing_mode IN ('stable', 'smart')),
  attempt_no INTEGER NOT NULL CHECK (attempt_no > 0),
  priority INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  selection_reason JSONB NOT NULL DEFAULT '{}'::jsonb,
  queue_latency_ms INTEGER,
  provider_latency_ms INTEGER,
  total_latency_ms INTEGER,
  input_units BIGINT,
  output_units BIGINT,
  output_width INTEGER,
  output_height INTEGER,
  estimated_cost_usd NUMERIC(18, 8),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_category TEXT,
  error_code TEXT,
  error_message TEXT,
  http_status INTEGER,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_route_attempts_deployment_created_idx
  ON public.ai_route_attempts (deployment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_route_attempts_generation_idx
  ON public.ai_route_attempts (generation_id, created_at DESC)
  WHERE generation_id IS NOT NULL;

ALTER TABLE public.ai_provider_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_provider_health FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ai_route_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_route_attempts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_provider_health, public.ai_route_attempts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_provider_health, public.ai_route_attempts TO service_role;

CREATE OR REPLACE FUNCTION public.publish_ai_control_plane_config(
  p_value JSONB,
  p_created_by UUID
)
RETURNS SETOF public.admin_config_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.admin_config_versions%ROWTYPE;
BEGIN
  IF jsonb_typeof(p_value) <> 'object' THEN
    RAISE EXCEPTION 'AI_CONTROL_PLANE_CONFIG_MUST_BE_OBJECT' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('ai.control-plane.v1'));
  UPDATE public.admin_config_versions
  SET status = 'archived'
  WHERE config_key = 'ai.control-plane.v1' AND status = 'published';
  INSERT INTO public.admin_config_versions (config_key, value, status, created_by, published_at)
  VALUES ('ai.control-plane.v1', p_value, 'published', p_created_by, now())
  RETURNING * INTO v_row;
  RETURN NEXT v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_ai_provider_outcome(
  p_deployment_id TEXT,
  p_model_id TEXT,
  p_provider_id TEXT,
  p_succeeded BOOLEAN,
  p_latency_ms INTEGER,
  p_error_category TEXT,
  p_http_status INTEGER,
  p_failure_threshold INTEGER,
  p_minimum_samples INTEGER,
  p_open_seconds INTEGER,
  p_rate_limit_seconds INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.ai_provider_health%ROWTYPE;
  v_samples BIGINT;
  v_failures INTEGER;
BEGIN
  INSERT INTO public.ai_provider_health (deployment_id, model_id, provider_id)
  VALUES (p_deployment_id, p_model_id, p_provider_id)
  ON CONFLICT (deployment_id) DO NOTHING;

  SELECT * INTO v_row
  FROM public.ai_provider_health
  WHERE deployment_id = p_deployment_id
  FOR UPDATE;

  v_samples := v_row.sample_count + 1;
  v_failures := CASE WHEN p_succeeded THEN 0 ELSE v_row.consecutive_failures + 1 END;

  UPDATE public.ai_provider_health
  SET model_id = p_model_id,
      provider_id = p_provider_id,
      consecutive_failures = v_failures,
      sample_count = v_samples,
      ewma_success_rate = CASE
        WHEN v_row.sample_count = 0 THEN CASE WHEN p_succeeded THEN 1 ELSE 0 END
        ELSE v_row.ewma_success_rate * 0.8 + CASE WHEN p_succeeded THEN 0.2 ELSE 0 END
      END,
      ewma_latency_ms = CASE
        WHEN v_row.sample_count = 0 THEN GREATEST(COALESCE(p_latency_ms, 0), 0)
        ELSE v_row.ewma_latency_ms * 0.8 + GREATEST(COALESCE(p_latency_ms, 0), 0) * 0.2
      END,
      circuit_state = CASE
        WHEN p_succeeded THEN 'closed'
        WHEN v_failures >= GREATEST(p_failure_threshold, 1)
          AND v_samples >= GREATEST(p_minimum_samples, 1) THEN 'open'
        ELSE v_row.circuit_state
      END,
      opened_until = CASE
        WHEN p_succeeded THEN NULL
        WHEN v_failures >= GREATEST(p_failure_threshold, 1)
          AND v_samples >= GREATEST(p_minimum_samples, 1)
          THEN now() + make_interval(secs => GREATEST(p_open_seconds, 5))
        ELSE v_row.opened_until
      END,
      rate_limited_until = CASE
        WHEN p_error_category = 'rate_limit' OR p_http_status = 429
          THEN now() + make_interval(secs => GREATEST(p_rate_limit_seconds, 5))
        WHEN p_succeeded THEN NULL
        ELSE v_row.rate_limited_until
      END,
      updated_at = now()
  WHERE deployment_id = p_deployment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_ai_provider_metrics(p_since TIMESTAMPTZ)
RETURNS TABLE(
  deployment_id TEXT,
  model_id TEXT,
  provider_id TEXT,
  request_count BIGINT,
  success_count BIGINT,
  failure_count BIGINT,
  success_rate DOUBLE PRECISION,
  avg_latency_ms DOUBLE PRECISION,
  p50_latency_ms DOUBLE PRECISION,
  p95_latency_ms DOUBLE PRECISION,
  estimated_cost_usd NUMERIC,
  last_request_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.deployment_id,
    max(a.model_id),
    max(a.provider_id),
    count(*),
    count(*) FILTER (WHERE a.status = 'succeeded'),
    count(*) FILTER (WHERE a.status = 'failed'),
    avg(CASE WHEN a.status = 'succeeded' THEN 1.0 ELSE 0.0 END)::DOUBLE PRECISION,
    avg(a.provider_latency_ms)::DOUBLE PRECISION,
    percentile_cont(0.50) WITHIN GROUP (ORDER BY a.provider_latency_ms)::DOUBLE PRECISION,
    percentile_cont(0.95) WITHIN GROUP (ORDER BY a.provider_latency_ms)::DOUBLE PRECISION,
    COALESCE(sum(a.estimated_cost_usd), 0),
    max(a.created_at)
  FROM public.ai_route_attempts AS a
  WHERE a.created_at >= COALESCE(p_since, now() - interval '24 hours')
    AND a.status IN ('succeeded', 'failed')
  GROUP BY a.deployment_id
  ORDER BY max(a.created_at) DESC;
$$;

REVOKE ALL ON FUNCTION public.publish_ai_control_plane_config(JSONB, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_ai_provider_outcome(TEXT, TEXT, TEXT, BOOLEAN, INTEGER, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_ai_provider_metrics(TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_ai_control_plane_config(JSONB, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_ai_provider_outcome(TEXT, TEXT, TEXT, BOOLEAN, INTEGER, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_ai_provider_metrics(TIMESTAMPTZ) TO service_role;
