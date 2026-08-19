-- Unified AI model control plane.
-- Run after schema.sql and admin-console.sql.
-- Configuration snapshots stay in admin_config_versions under
-- `ai.control-plane.v1`; these tables contain runtime state and telemetry.

CREATE TABLE IF NOT EXISTS public.ai_provider_health (
  deployment_id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  circuit_state TEXT NOT NULL DEFAULT 'closed'
    CHECK (circuit_state IN ('closed', 'open', 'half_open')),
  consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  sample_count BIGINT NOT NULL DEFAULT 0 CHECK (sample_count >= 0),
  success_count BIGINT NOT NULL DEFAULT 0 CHECK (success_count >= 0),
  failure_count BIGINT NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  ewma_success_rate DOUBLE PRECISION NOT NULL DEFAULT 1
    CHECK (ewma_success_rate >= 0 AND ewma_success_rate <= 1),
  ewma_latency_ms DOUBLE PRECISION NOT NULL DEFAULT 0 CHECK (ewma_latency_ms >= 0),
  opened_until TIMESTAMPTZ,
  rate_limited_until TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  last_error_category TEXT,
  last_http_status INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_provider_health_model_state_idx
  ON public.ai_provider_health (model_id, circuit_state, updated_at DESC);
CREATE INDEX IF NOT EXISTS ai_provider_health_opened_idx
  ON public.ai_provider_health (opened_until)
  WHERE circuit_state <> 'closed';
CREATE INDEX IF NOT EXISTS ai_provider_health_rate_limited_idx
  ON public.ai_provider_health (rate_limited_until)
  WHERE rate_limited_until IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.ai_route_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL,
  generation_id UUID,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  model_id TEXT NOT NULL,
  modality TEXT NOT NULL
    CHECK (modality IN ('image', 'text', 'vision', 'video', 'audio', 'embedding')),
  deployment_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  upstream_model TEXT NOT NULL,
  routing_mode TEXT NOT NULL DEFAULT 'stable'
    CHECK (routing_mode IN ('stable', 'smart')),
  attempt_no SMALLINT NOT NULL CHECK (attempt_no >= 1),
  priority INTEGER NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'failed', 'cancelled')),
  selection_reason JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_category TEXT,
  error_code TEXT,
  error_message TEXT,
  http_status INTEGER,
  queue_latency_ms INTEGER CHECK (queue_latency_ms IS NULL OR queue_latency_ms >= 0),
  provider_latency_ms INTEGER CHECK (provider_latency_ms IS NULL OR provider_latency_ms >= 0),
  total_latency_ms INTEGER CHECK (total_latency_ms IS NULL OR total_latency_ms >= 0),
  input_units NUMERIC CHECK (input_units IS NULL OR input_units >= 0),
  output_units NUMERIC CHECK (output_units IS NULL OR output_units >= 0),
  estimated_cost_usd NUMERIC(14, 8) CHECK (estimated_cost_usd IS NULL OR estimated_cost_usd >= 0),
  output_width INTEGER CHECK (output_width IS NULL OR output_width > 0),
  output_height INTEGER CHECK (output_height IS NULL OR output_height > 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (request_id, attempt_no)
);

CREATE INDEX IF NOT EXISTS ai_route_attempts_model_created_idx
  ON public.ai_route_attempts (model_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_route_attempts_deployment_created_idx
  ON public.ai_route_attempts (deployment_id, created_at DESC)
  INCLUDE (status, provider_latency_ms, estimated_cost_usd, error_category);
CREATE INDEX IF NOT EXISTS ai_route_attempts_generation_idx
  ON public.ai_route_attempts (generation_id, created_at)
  WHERE generation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_route_attempts_user_created_idx
  ON public.ai_route_attempts (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_route_attempts_failures_idx
  ON public.ai_route_attempts (created_at DESC, deployment_id)
  WHERE status = 'failed';
CREATE INDEX IF NOT EXISTS ai_route_attempts_created_brin_idx
  ON public.ai_route_attempts USING brin (created_at)
  WITH (pages_per_range = 64);

CREATE TABLE IF NOT EXISTS public.ai_user_routing_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  routing_mode TEXT NOT NULL DEFAULT 'stable'
    CHECK (routing_mode IN ('stable', 'smart')),
  allow_cross_model_fallback BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_ai_control_plane_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ai_provider_health_set_updated_at ON public.ai_provider_health;
CREATE TRIGGER ai_provider_health_set_updated_at
  BEFORE UPDATE ON public.ai_provider_health
  FOR EACH ROW EXECUTE FUNCTION public.set_ai_control_plane_updated_at();

DROP TRIGGER IF EXISTS ai_user_routing_preferences_set_updated_at ON public.ai_user_routing_preferences;
CREATE TRIGGER ai_user_routing_preferences_set_updated_at
  BEFORE UPDATE ON public.ai_user_routing_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_ai_control_plane_updated_at();

ALTER TABLE public.ai_provider_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_route_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_user_routing_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own AI routing preference" ON public.ai_user_routing_preferences;
CREATE POLICY "Users can read own AI routing preference"
  ON public.ai_user_routing_preferences FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own AI routing preference" ON public.ai_user_routing_preferences;
CREATE POLICY "Users can insert own AI routing preference"
  ON public.ai_user_routing_preferences FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own AI routing preference" ON public.ai_user_routing_preferences;
CREATE POLICY "Users can update own AI routing preference"
  ON public.ai_user_routing_preferences FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.ai_provider_health FROM anon, authenticated;
REVOKE ALL ON TABLE public.ai_route_attempts FROM anon, authenticated;
REVOKE ALL ON TABLE public.ai_user_routing_preferences FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.ai_user_routing_preferences TO authenticated;

-- Admin/server-side metrics. Kept as a single aggregate query so the UI does
-- not pull raw request rows. Only service_role may execute it.
CREATE OR REPLACE FUNCTION public.admin_ai_provider_metrics(
  p_since TIMESTAMPTZ DEFAULT now() - interval '24 hours'
)
RETURNS TABLE (
  deployment_id TEXT,
  model_id TEXT,
  provider_id TEXT,
  request_count BIGINT,
  success_count BIGINT,
  failure_count BIGINT,
  success_rate NUMERIC,
  avg_latency_ms NUMERIC,
  p50_latency_ms NUMERIC,
  p95_latency_ms NUMERIC,
  estimated_cost_usd NUMERIC,
  last_request_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    a.deployment_id,
    max(a.model_id) AS model_id,
    max(a.provider_id) AS provider_id,
    count(*) AS request_count,
    count(*) FILTER (WHERE a.status = 'succeeded') AS success_count,
    count(*) FILTER (WHERE a.status = 'failed') AS failure_count,
    round(
      (count(*) FILTER (WHERE a.status = 'succeeded'))::numeric
      / nullif(count(*) FILTER (WHERE a.status IN ('succeeded', 'failed')), 0),
      4
    ) AS success_rate,
    round(avg(a.provider_latency_ms) FILTER (WHERE a.provider_latency_ms IS NOT NULL), 0) AS avg_latency_ms,
    round(percentile_cont(0.5) WITHIN GROUP (ORDER BY a.provider_latency_ms)
      FILTER (WHERE a.provider_latency_ms IS NOT NULL)) AS p50_latency_ms,
    round(percentile_cont(0.95) WITHIN GROUP (ORDER BY a.provider_latency_ms)
      FILTER (WHERE a.provider_latency_ms IS NOT NULL)) AS p95_latency_ms,
    coalesce(round(sum(a.estimated_cost_usd), 6), 0) AS estimated_cost_usd,
    max(a.created_at) AS last_request_at
  FROM public.ai_route_attempts a
  WHERE a.created_at >= greatest(p_since, now() - interval '90 days')
  GROUP BY a.deployment_id
  ORDER BY request_count DESC;
$$;

REVOKE ALL ON FUNCTION public.admin_ai_provider_metrics(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ai_provider_metrics(TIMESTAMPTZ) TO service_role;

-- Atomically update health after one upstream attempt. This avoids a
-- read-modify-write race when many workers finish at the same time.
CREATE OR REPLACE FUNCTION public.record_ai_provider_outcome(
  p_deployment_id TEXT,
  p_model_id TEXT,
  p_provider_id TEXT,
  p_succeeded BOOLEAN,
  p_latency_ms INTEGER,
  p_error_category TEXT DEFAULT NULL,
  p_http_status INTEGER DEFAULT NULL,
  p_failure_threshold INTEGER DEFAULT 5,
  p_minimum_samples INTEGER DEFAULT 5,
  p_open_seconds INTEGER DEFAULT 60,
  p_rate_limit_seconds INTEGER DEFAULT 60
)
RETURNS public.ai_provider_health
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.ai_provider_health;
BEGIN
  INSERT INTO public.ai_provider_health (
    deployment_id, model_id, provider_id, circuit_state,
    consecutive_failures, sample_count, success_count, failure_count,
    ewma_success_rate, ewma_latency_ms, opened_until, rate_limited_until,
    last_success_at, last_failure_at, last_error_category, last_http_status
  ) VALUES (
    p_deployment_id, p_model_id, p_provider_id,
    CASE
      WHEN NOT p_succeeded
        AND greatest(p_minimum_samples, 1) <= 1
        AND greatest(p_failure_threshold, 1) <= 1
        THEN 'open'
      ELSE 'closed'
    END,
    CASE WHEN p_succeeded THEN 0 ELSE 1 END,
    1,
    CASE WHEN p_succeeded THEN 1 ELSE 0 END,
    CASE WHEN p_succeeded THEN 0 ELSE 1 END,
    CASE WHEN p_succeeded THEN 1 ELSE 0 END,
    greatest(coalesce(p_latency_ms, 0), 0),
    CASE
      WHEN NOT p_succeeded
        AND greatest(p_minimum_samples, 1) <= 1
        AND greatest(p_failure_threshold, 1) <= 1
        THEN now() + make_interval(secs => greatest(p_open_seconds, 1))
      ELSE NULL
    END,
    CASE WHEN p_error_category = 'rate_limit' THEN now() + make_interval(secs => greatest(p_rate_limit_seconds, 1)) ELSE NULL END,
    CASE WHEN p_succeeded THEN now() ELSE NULL END,
    CASE WHEN p_succeeded THEN NULL ELSE now() END,
    CASE WHEN p_succeeded THEN NULL ELSE p_error_category END,
    CASE WHEN p_succeeded THEN NULL ELSE p_http_status END
  )
  ON CONFLICT (deployment_id) DO UPDATE SET
    model_id = EXCLUDED.model_id,
    provider_id = EXCLUDED.provider_id,
    sample_count = public.ai_provider_health.sample_count + 1,
    success_count = public.ai_provider_health.success_count + CASE WHEN p_succeeded THEN 1 ELSE 0 END,
    failure_count = public.ai_provider_health.failure_count + CASE WHEN p_succeeded THEN 0 ELSE 1 END,
    consecutive_failures = CASE WHEN p_succeeded THEN 0 ELSE public.ai_provider_health.consecutive_failures + 1 END,
    ewma_success_rate = public.ai_provider_health.ewma_success_rate * 0.8 + CASE WHEN p_succeeded THEN 0.2 ELSE 0 END,
    ewma_latency_ms = CASE
      WHEN coalesce(p_latency_ms, 0) <= 0 THEN public.ai_provider_health.ewma_latency_ms
      WHEN public.ai_provider_health.ewma_latency_ms <= 0 THEN p_latency_ms
      ELSE public.ai_provider_health.ewma_latency_ms * 0.8 + p_latency_ms * 0.2
    END,
    circuit_state = CASE
      WHEN p_succeeded THEN 'closed'
      WHEN public.ai_provider_health.sample_count + 1 >= greatest(p_minimum_samples, 1)
        AND public.ai_provider_health.consecutive_failures + 1 >= greatest(p_failure_threshold, 1)
        THEN 'open'
      ELSE public.ai_provider_health.circuit_state
    END,
    opened_until = CASE
      WHEN p_succeeded THEN NULL
      WHEN public.ai_provider_health.sample_count + 1 >= greatest(p_minimum_samples, 1)
        AND public.ai_provider_health.consecutive_failures + 1 >= greatest(p_failure_threshold, 1)
        THEN now() + make_interval(secs => greatest(p_open_seconds, 1))
      ELSE public.ai_provider_health.opened_until
    END,
    rate_limited_until = CASE
      WHEN p_error_category = 'rate_limit' THEN now() + make_interval(secs => greatest(p_rate_limit_seconds, 1))
      WHEN p_succeeded AND public.ai_provider_health.rate_limited_until < now() THEN NULL
      ELSE public.ai_provider_health.rate_limited_until
    END,
    last_success_at = CASE WHEN p_succeeded THEN now() ELSE public.ai_provider_health.last_success_at END,
    last_failure_at = CASE WHEN p_succeeded THEN public.ai_provider_health.last_failure_at ELSE now() END,
    last_error_category = CASE WHEN p_succeeded THEN NULL ELSE p_error_category END,
    last_http_status = CASE WHEN p_succeeded THEN NULL ELSE p_http_status END,
    updated_at = now()
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.record_ai_provider_outcome(TEXT, TEXT, TEXT, BOOLEAN, INTEGER, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_ai_provider_outcome(TEXT, TEXT, TEXT, BOOLEAN, INTEGER, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER) TO service_role;

-- Publish a validated control-plane snapshot atomically. Rollback publishes a
-- new copy of an older value, preserving an append-only history.
CREATE OR REPLACE FUNCTION public.publish_ai_control_plane_config(
  p_value JSONB,
  p_created_by UUID
)
RETURNS public.admin_config_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.admin_config_versions;
BEGIN
  UPDATE public.admin_config_versions
  SET status = 'archived'
  WHERE config_key = 'ai.control-plane.v1' AND status = 'published';

  INSERT INTO public.admin_config_versions (
    config_key, value, status, created_by, published_at
  ) VALUES (
    'ai.control-plane.v1', p_value, 'published', p_created_by, now()
  ) RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_ai_control_plane_config(JSONB, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_ai_control_plane_config(JSONB, UUID) TO service_role;

-- Keep operational telemetry bounded. The function is deliberately batched
-- to avoid long delete transactions and also reconciles abandoned attempts
-- left behind by a worker crash. Supabase Cron invokes it hourly below.
CREATE OR REPLACE FUNCTION public.maintain_ai_route_attempts(
  p_retention_days INTEGER DEFAULT 90,
  p_batch_size INTEGER DEFAULT 50000,
  p_stale_minutes INTEGER DEFAULT 90
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_reconciled BIGINT := 0;
  v_deleted BIGINT := 0;
  v_batch INTEGER := least(greatest(p_batch_size, 1), 100000);
BEGIN
  IF p_retention_days < 7 OR p_retention_days > 3650 THEN
    RAISE EXCEPTION 'p_retention_days must be between 7 and 3650';
  END IF;
  IF p_stale_minutes < 30 OR p_stale_minutes > 10080 THEN
    RAISE EXCEPTION 'p_stale_minutes must be between 30 and 10080';
  END IF;

  UPDATE public.ai_route_attempts
  SET
    status = 'cancelled',
    error_category = 'worker_interrupted',
    error_message = 'worker_interrupted',
    completed_at = now()
  WHERE id IN (
    SELECT id
    FROM public.ai_route_attempts
    WHERE status = 'running'
      AND started_at < now() - make_interval(mins => p_stale_minutes)
    ORDER BY started_at
    LIMIT v_batch
    FOR UPDATE SKIP LOCKED
  );
  GET DIAGNOSTICS v_reconciled = ROW_COUNT;

  DELETE FROM public.ai_route_attempts
  WHERE id IN (
    SELECT id
    FROM public.ai_route_attempts
    WHERE created_at < now() - make_interval(days => p_retention_days)
    ORDER BY created_at
    LIMIT v_batch
    FOR UPDATE SKIP LOCKED
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN jsonb_build_object('reconciled', v_reconciled, 'deleted', v_deleted);
END;
$$;

REVOKE ALL ON FUNCTION public.maintain_ai_route_attempts(INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.maintain_ai_route_attempts(INTEGER, INTEGER, INTEGER) TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule(
  'ai-route-attempts-maintenance',
  '17 * * * *',
  'SELECT public.maintain_ai_route_attempts();'
);

COMMENT ON TABLE public.ai_route_attempts IS
  'One row per routed provider attempt. Prompts, API keys and full provider payloads must never be stored here.';
COMMENT ON TABLE public.ai_provider_health IS
  'Compact circuit-breaker and EWMA health state for AI provider deployments.';
