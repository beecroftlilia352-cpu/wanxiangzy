-- Capacity saturation is a queue state, not a terminal provider error.
-- Keep it separate from error_message, bound the wait, and settle refunds
-- atomically when the queue budget is exhausted.

ALTER TABLE public.generations
  ADD COLUMN IF NOT EXISTS queue_reason TEXT,
  ADD COLUMN IF NOT EXISTS capacity_defer_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS capacity_first_deferred_at TIMESTAMPTZ;

ALTER TABLE public.generations
  DROP CONSTRAINT IF EXISTS generations_capacity_defer_count_check;
ALTER TABLE public.generations
  ADD CONSTRAINT generations_capacity_defer_count_check
  CHECK (capacity_defer_count BETWEEN 0 AND 10000);

UPDATE public.generations
SET queue_reason = 'provider_capacity',
    error_message = NULL
WHERE status = 'queued'
  AND error_message LIKE '%供应商池%稍后重试%';

CREATE OR REPLACE FUNCTION public.settle_generation_for_ai_capacity(
  p_generation_id UUID,
  p_user_id UUID,
  p_delivery_version INTEGER,
  p_execution_token UUID,
  p_delay_seconds INTEGER DEFAULT 15,
  p_reason TEXT DEFAULT 'AI provider capacity is temporarily unavailable'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_generation public.generations%ROWTYPE;
  v_next_count INTEGER;
  v_first_deferred_at TIMESTAMPTZ;
  v_backoff_seconds INTEGER;
  v_effective_delay INTEGER;
  v_refund_amount INTEGER;
  v_balance INTEGER;
BEGIN
  IF COALESCE((SELECT auth.role()), '') <> 'service_role' THEN
    RAISE EXCEPTION 'GENERATION_CAPACITY_SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_delay_seconds IS NULL OR p_delay_seconds NOT BETWEEN 5 AND 3600 THEN
    RAISE EXCEPTION 'INVALID_CAPACITY_DELAY' USING ERRCODE = '22023';
  END IF;

  SELECT g.*
  INTO v_generation
  FROM public.generations AS g
  WHERE g.id = p_generation_id
    AND g.user_id = p_user_id
    AND g.status = 'processing_tryon'
    AND g.delivery_version = p_delivery_version
    AND g.execution_token = p_execution_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'STALE_EXECUTION_FENCE' USING ERRCODE = '40001';
  END IF;

  v_next_count := COALESCE(v_generation.capacity_defer_count, 0) + 1;
  v_first_deferred_at := COALESCE(v_generation.capacity_first_deferred_at, v_now);

  -- Twelve exponentially backed-off deferrals are roughly 25-30 minutes.
  -- The wall-clock ceiling protects old rows if retry timings are changed.
  IF v_next_count >= 12 OR v_first_deferred_at <= v_now - interval '30 minutes' THEN
    v_refund_amount := GREATEST(
      COALESCE(v_generation.credits_used, v_generation.credits_cost, 0),
      0
    );

    UPDATE public.generations AS g
    SET status = 'failed',
        error_message = left(
          '模型供应商容量持续不可用，排队等待已超过上限，灵点已退还',
          1000
        ),
        queue_reason = NULL,
        capacity_defer_count = v_next_count,
        processing_started_at = NULL,
        execution_token = NULL,
        execution_lease_expires_at = NULL,
        completed_at = COALESCE(g.completed_at, v_now),
        credits_used = 0,
        updated_at = v_now
    WHERE g.id = v_generation.id;

    SELECT p.credits INTO v_balance
    FROM public.profiles AS p
    WHERE p.id = v_generation.user_id;

    IF v_refund_amount > 0 THEN
      UPDATE public.profiles AS p
      SET credits = p.credits + v_refund_amount,
          total_credits_used = GREATEST(COALESCE(p.total_credits_used, 0) - v_refund_amount, 0),
          updated_at = v_now
      WHERE p.id = v_generation.user_id
      RETURNING p.credits INTO v_balance;

      IF v_balance IS NOT NULL THEN
        INSERT INTO public.credit_logs (user_id, amount, balance, reason, generation_id)
        VALUES (
          v_generation.user_id,
          v_refund_amount,
          v_balance,
          '模型容量排队超时退款',
          v_generation.id
        );
      END IF;
    END IF;

    RETURN 'failed';
  END IF;

  v_backoff_seconds := LEAST(
    300,
    GREATEST(p_delay_seconds, 5) * power(2, LEAST(v_next_count - 1, 6))::INTEGER
  );
  v_effective_delay := LEAST(
    300,
    GREATEST(5, floor(v_backoff_seconds * (0.75 + random() * 0.5))::INTEGER)
  );

  UPDATE public.generations AS g
  SET status = 'queued',
      processing_started_at = NULL,
      delivery_version = g.delivery_version + 1,
      available_at = v_now + make_interval(secs => v_effective_delay),
      execution_token = NULL,
      execution_lease_expires_at = NULL,
      job_attempts = GREATEST(COALESCE(g.job_attempts, 0) - 1, 0),
      queue_reason = 'provider_capacity',
      capacity_defer_count = v_next_count,
      capacity_first_deferred_at = v_first_deferred_at,
      error_message = NULL,
      completed_at = NULL,
      updated_at = v_now
  WHERE g.id = v_generation.id
  RETURNING g.* INTO v_generation;

  INSERT INTO private.generation_job_outbox (
    generation_id,
    user_id,
    delivery_version,
    delivery_key,
    idempotency_key,
    payload,
    available_at,
    last_error
  )
  VALUES (
    v_generation.id,
    v_generation.user_id,
    v_generation.delivery_version,
    'generation-' || v_generation.id::TEXT || '-v' || v_generation.delivery_version::TEXT,
    COALESCE(v_generation.request_idempotency_key, 'internal-generation-' || v_generation.id::TEXT),
    jsonb_build_object(
      'schemaVersion', 1,
      'generationId', v_generation.id,
      'deliveryVersion', v_generation.delivery_version
    ),
    v_generation.available_at,
    left(COALESCE(NULLIF(btrim(p_reason), ''), 'provider capacity wait'), 1000)
  )
  ON CONFLICT (generation_id, delivery_version) DO NOTHING;

  RETURN 'deferred';
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_generation_for_retryable_error(
  p_generation_id UUID,
  p_user_id UUID,
  p_delivery_version INTEGER,
  p_execution_token UUID,
  p_delay_seconds INTEGER DEFAULT 15,
  p_max_attempts INTEGER DEFAULT 10,
  p_reason TEXT DEFAULT 'generation provider temporarily unavailable'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_generation public.generations%ROWTYPE;
  v_backoff_seconds INTEGER;
  v_effective_delay INTEGER;
  v_refund_amount INTEGER;
  v_balance INTEGER;
BEGIN
  IF COALESCE((SELECT auth.role()), '') <> 'service_role' THEN
    RAISE EXCEPTION 'GENERATION_RETRY_SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_delay_seconds IS NULL OR p_delay_seconds NOT BETWEEN 5 AND 3600 THEN
    RAISE EXCEPTION 'INVALID_GENERATION_RETRY_DELAY' USING ERRCODE = '22023';
  END IF;
  IF p_max_attempts IS NULL OR p_max_attempts NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'INVALID_GENERATION_RETRY_LIMIT' USING ERRCODE = '22023';
  END IF;

  SELECT g.*
  INTO v_generation
  FROM public.generations AS g
  WHERE g.id = p_generation_id
    AND g.user_id = p_user_id
    AND g.status = 'processing_tryon'
    AND g.delivery_version = p_delivery_version
    AND g.execution_token = p_execution_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'STALE_EXECUTION_FENCE' USING ERRCODE = '40001';
  END IF;

  IF COALESCE(v_generation.job_attempts, 0) >= p_max_attempts THEN
    v_refund_amount := GREATEST(
      COALESCE(v_generation.credits_used, v_generation.credits_cost, 0),
      0
    );

    UPDATE public.generations AS g
    SET status = 'failed',
        error_message = '生成服务多次重试仍不可用，灵点已退还',
        queue_reason = NULL,
        processing_started_at = NULL,
        execution_token = NULL,
        execution_lease_expires_at = NULL,
        completed_at = COALESCE(g.completed_at, v_now),
        credits_used = 0,
        updated_at = v_now
    WHERE g.id = v_generation.id;

    SELECT p.credits INTO v_balance
    FROM public.profiles AS p
    WHERE p.id = v_generation.user_id;

    IF v_refund_amount > 0 THEN
      UPDATE public.profiles AS p
      SET credits = p.credits + v_refund_amount,
          total_credits_used = GREATEST(COALESCE(p.total_credits_used, 0) - v_refund_amount, 0),
          updated_at = v_now
      WHERE p.id = v_generation.user_id
      RETURNING p.credits INTO v_balance;

      IF v_balance IS NOT NULL THEN
        INSERT INTO public.credit_logs (user_id, amount, balance, reason, generation_id)
        VALUES (
          v_generation.user_id,
          v_refund_amount,
          v_balance,
          '生成服务重试耗尽退款',
          v_generation.id
        );
      END IF;
    END IF;

    RETURN 'failed';
  END IF;

  v_backoff_seconds := LEAST(
    300,
    GREATEST(p_delay_seconds, 5) * power(2, LEAST(GREATEST(v_generation.job_attempts, 1) - 1, 6))::INTEGER
  );
  v_effective_delay := LEAST(
    300,
    GREATEST(5, floor(v_backoff_seconds * (0.75 + random() * 0.5))::INTEGER)
  );

  UPDATE public.generations AS g
  SET status = 'queued',
      processing_started_at = NULL,
      delivery_version = g.delivery_version + 1,
      available_at = v_now + make_interval(secs => v_effective_delay),
      execution_token = NULL,
      execution_lease_expires_at = NULL,
      queue_reason = 'retryable_error',
      error_message = NULL,
      completed_at = NULL,
      updated_at = v_now
  WHERE g.id = v_generation.id
  RETURNING g.* INTO v_generation;

  INSERT INTO private.generation_job_outbox (
    generation_id,
    user_id,
    delivery_version,
    delivery_key,
    idempotency_key,
    payload,
    available_at,
    last_error
  )
  VALUES (
    v_generation.id,
    v_generation.user_id,
    v_generation.delivery_version,
    'generation-' || v_generation.id::TEXT || '-v' || v_generation.delivery_version::TEXT,
    COALESCE(v_generation.request_idempotency_key, 'internal-generation-' || v_generation.id::TEXT),
    jsonb_build_object(
      'schemaVersion', 1,
      'generationId', v_generation.id,
      'deliveryVersion', v_generation.delivery_version
    ),
    v_generation.available_at,
    left(COALESCE(NULLIF(btrim(p_reason), ''), 'generation retry'), 1000)
  )
  ON CONFLICT (generation_id, delivery_version) DO NOTHING;

  RETURN 'deferred';
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_retry_generation(
  p_generation_id UUID,
  p_reason TEXT
)
RETURNS TABLE(
  outcome TEXT,
  previous_status TEXT,
  delivery_version INTEGER,
  available_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_generation public.generations%ROWTYPE;
  v_previous_status TEXT;
BEGIN
  IF COALESCE((SELECT auth.role()), '') <> 'service_role' THEN
    RAISE EXCEPTION 'ADMIN_GENERATION_RETRY_SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 4 AND 240 THEN
    RAISE EXCEPTION 'INVALID_ADMIN_GENERATION_REASON' USING ERRCODE = '22023';
  END IF;

  SELECT g.*
  INTO v_generation
  FROM public.generations AS g
  WHERE g.id = p_generation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'GENERATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_generation.status IN ('completed', 'failed', 'cancelled', 'canceled') THEN
    RAISE EXCEPTION 'GENERATION_ALREADY_TERMINAL' USING ERRCODE = '55000';
  END IF;
  IF v_generation.status = 'processing_tryon'
    AND v_generation.execution_lease_expires_at > v_now THEN
    RETURN QUERY SELECT
      'already_running'::TEXT,
      v_generation.status,
      v_generation.delivery_version,
      v_generation.available_at;
    RETURN;
  END IF;
  IF v_generation.status NOT IN ('queued', 'processing_tryon') THEN
    RAISE EXCEPTION 'GENERATION_STATUS_NOT_RETRYABLE' USING ERRCODE = '55000';
  END IF;
  v_previous_status := v_generation.status;

  UPDATE public.generations AS g
  SET status = 'queued',
      processing_started_at = NULL,
      delivery_version = g.delivery_version + 1,
      available_at = v_now,
      execution_token = NULL,
      execution_lease_expires_at = NULL,
      queue_reason = 'admin_retry',
      error_message = NULL,
      completed_at = NULL,
      updated_at = v_now
  WHERE g.id = v_generation.id
  RETURNING g.* INTO v_generation;

  INSERT INTO private.generation_job_outbox (
    generation_id,
    user_id,
    delivery_version,
    delivery_key,
    idempotency_key,
    payload,
    available_at,
    last_error
  )
  VALUES (
    v_generation.id,
    v_generation.user_id,
    v_generation.delivery_version,
    'generation-' || v_generation.id::TEXT || '-v' || v_generation.delivery_version::TEXT,
    COALESCE(v_generation.request_idempotency_key, 'internal-generation-' || v_generation.id::TEXT),
    jsonb_build_object(
      'schemaVersion', 1,
      'generationId', v_generation.id,
      'deliveryVersion', v_generation.delivery_version
    ),
    v_now,
    left('admin retry: ' || btrim(p_reason), 1000)
  )
  ON CONFLICT (generation_id, delivery_version) DO NOTHING;

  RETURN QUERY SELECT
    'requeued'::TEXT,
    v_previous_status,
    v_generation.delivery_version,
    v_generation.available_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_settle_generation(
  p_generation_id UUID,
  p_refund BOOLEAN,
  p_reason TEXT
)
RETURNS TABLE(
  outcome TEXT,
  previous_status TEXT,
  refund_amount INTEGER,
  balance INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_generation public.generations%ROWTYPE;
  v_refund_amount INTEGER := 0;
  v_balance INTEGER;
BEGIN
  IF COALESCE((SELECT auth.role()), '') <> 'service_role' THEN
    RAISE EXCEPTION 'ADMIN_GENERATION_SETTLEMENT_SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 4 AND 240 THEN
    RAISE EXCEPTION 'INVALID_ADMIN_GENERATION_REASON' USING ERRCODE = '22023';
  END IF;

  SELECT g.*
  INTO v_generation
  FROM public.generations AS g
  WHERE g.id = p_generation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'GENERATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_generation.status IN ('completed', 'failed', 'cancelled', 'canceled') THEN
    SELECT p.credits INTO v_balance FROM public.profiles AS p WHERE p.id = v_generation.user_id;
    RETURN QUERY SELECT 'already_terminal'::TEXT, v_generation.status, 0, COALESCE(v_balance, 0);
    RETURN;
  END IF;

  IF p_refund THEN
    v_refund_amount := GREATEST(
      COALESCE(v_generation.credits_used, v_generation.credits_cost, 0),
      0
    );
  END IF;

  UPDATE public.generations AS g
  SET status = 'failed',
      delivery_version = g.delivery_version + 1,
      error_message = left(btrim(p_reason), 1000),
      queue_reason = NULL,
      processing_started_at = NULL,
      execution_token = NULL,
      execution_lease_expires_at = NULL,
      completed_at = COALESCE(g.completed_at, v_now),
      credits_used = CASE WHEN p_refund THEN 0 ELSE g.credits_used END,
      updated_at = v_now
  WHERE g.id = v_generation.id;

  SELECT p.credits INTO v_balance FROM public.profiles AS p WHERE p.id = v_generation.user_id;
  IF v_refund_amount > 0 THEN
    UPDATE public.profiles AS p
    SET credits = p.credits + v_refund_amount,
        total_credits_used = GREATEST(COALESCE(p.total_credits_used, 0) - v_refund_amount, 0),
        updated_at = v_now
    WHERE p.id = v_generation.user_id
    RETURNING p.credits INTO v_balance;

    IF v_balance IS NOT NULL THEN
      INSERT INTO public.credit_logs (user_id, amount, balance, reason, generation_id)
      VALUES (
        v_generation.user_id,
        v_refund_amount,
        v_balance,
        '管理员任务结算退款：' || left(btrim(p_reason), 200),
        v_generation.id
      );
    END IF;
  END IF;

  RETURN QUERY SELECT
    'settled'::TEXT,
    v_generation.status,
    v_refund_amount,
    COALESCE(v_balance, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.settle_generation_for_ai_capacity(UUID, UUID, INTEGER, UUID, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.settle_generation_for_retryable_error(UUID, UUID, INTEGER, UUID, INTEGER, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_retry_generation(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_settle_generation(UUID, BOOLEAN, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_generation_for_ai_capacity(UUID, UUID, INTEGER, UUID, INTEGER, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_generation_for_retryable_error(UUID, UUID, INTEGER, UUID, INTEGER, INTEGER, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_retry_generation(UUID, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_settle_generation(UUID, BOOLEAN, TEXT)
  TO service_role;

-- sha256 of:
-- wanxiang-runtime-contract|2026-08-21.2|generation-capacity-backpressure-v1|generation-retryable-backpressure-v1|admin-generation-requeue-v1|admin-generation-settlement-v1|generation-outbox-bounded-fair-fenced-recovery-redrive-v5|oss-mirror-fenced-media-bridge-v2|media-registry-validation-v2|cleanup-linearized-v2|generation-links-retention-v1
CREATE OR REPLACE FUNCTION public.get_runtime_contract_version()
RETURNS TABLE(contract_version TEXT, contract_hash TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    '2026-08-21.2'::TEXT,
    'c15cb3e0cf66c8f3333bde1e2c98051aa9534a018e196ab2fa87e011ff5da285'::TEXT;
$$;
