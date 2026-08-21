-- Commercial multi-tenant generation entitlements and queue priority.
--
-- The database is authoritative for service tier and admission. Callers may
-- request a lower operational limit, but cannot raise the subscription cap.
-- Trusted hidden child generations are deliberately excluded: the single
-- visible parent remains the admitted user task.

BEGIN;

ALTER TABLE public.generations
  ADD COLUMN IF NOT EXISTS service_tier TEXT NOT NULL DEFAULT 'standard';

-- Refund only work that was not already materialized. This keeps a partially
-- completed multi-slot task from exposing results while returning the full
-- charge after a later capacity timeout.
CREATE OR REPLACE FUNCTION private.generation_uncompleted_refund(
  p_credits INTEGER,
  p_result_urls TEXT[],
  p_job_payload JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_cost INTEGER := GREATEST(COALESCE(p_credits, 0), 0);
  v_expected INTEGER := GREATEST(COALESCE(NULLIF(p_job_payload ->> 'genCount', '')::INTEGER, 0), 0);
  v_completed INTEGER := 0;
  v_charged INTEGER;
BEGIN
  IF v_expected = 0 THEN
    v_expected := GREATEST(COALESCE(NULLIF(p_job_payload #>> '{generationBatchProgress,expectedCount}', '')::INTEGER, 0), 0);
  END IF;
  IF v_expected = 0 AND jsonb_typeof(p_job_payload -> 'moduleResults') = 'array' THEN
    v_expected := jsonb_array_length(p_job_payload -> 'moduleResults');
  END IF;
  v_completed := COALESCE((SELECT count(*) FROM unnest(COALESCE(p_result_urls, '{}'::TEXT[])) AS item(value) WHERE NULLIF(btrim(item.value), '') IS NOT NULL), 0);
  v_expected := GREATEST(v_expected, v_completed, 1);
  IF v_cost = 0 OR v_completed >= v_expected THEN RETURN 0; END IF;
  IF v_completed = 0 THEN RETURN v_cost; END IF;
  v_charged := LEAST(v_cost, GREATEST(1, floor(v_cost * v_completed::NUMERIC / v_expected)::INTEGER));
  RETURN GREATEST(v_cost - v_charged, 0);
END;
$$;

-- Recovery backstop for queued rows that never reach a worker (Redis/Worker
-- outage, relay pause, or a missed wake event). The row lock plus terminal
-- status makes the refund idempotent with worker-side settlement.
CREATE OR REPLACE FUNCTION public.recover_stale_generation_capacity_waits(
  p_limit INTEGER DEFAULT 100
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_generation public.generations%ROWTYPE;
  v_refund INTEGER;
  v_balance INTEGER;
  v_recovered INTEGER := 0;
BEGIN
  IF COALESCE((SELECT auth.role()), '') <> 'service_role' THEN
    RAISE EXCEPTION 'GENERATION_CAPACITY_RECOVERY_SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  FOR v_generation IN
    SELECT generation.*
    FROM public.generations AS generation
    WHERE generation.status = 'queued'
      AND generation.queue_reason IN ('provider_capacity', 'tenant_capacity')
      AND COALESCE(generation.capacity_first_deferred_at, generation.tenant_capacity_first_deferred_at)
        <= v_now - interval '10 minutes'
    ORDER BY COALESCE(generation.capacity_first_deferred_at, generation.tenant_capacity_first_deferred_at), generation.id
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 1000))
    FOR UPDATE SKIP LOCKED
  LOOP
    v_refund := private.generation_uncompleted_refund(
      COALESCE(v_generation.credits_used, v_generation.credits_cost, 0),
      v_generation.result_urls,
      v_generation.job_payload
    );
    UPDATE public.generations AS generation
    SET status = 'failed',
        error_message = '容量排队超过 10 分钟，灵点已退还',
        queue_reason = NULL,
        capacity_first_deferred_at = NULL,
        tenant_capacity_first_deferred_at = NULL,
        execution_token = NULL,
        execution_lease_expires_at = NULL,
        completed_at = COALESCE(generation.completed_at, v_now),
        credits_used = 0,
        updated_at = v_now
    WHERE generation.id = v_generation.id AND generation.status = 'queued';
    IF v_refund > 0 THEN
      UPDATE public.profiles AS profile
      SET credits = profile.credits + v_refund,
          total_credits_used = GREATEST(COALESCE(profile.total_credits_used, 0) - v_refund, 0),
          updated_at = v_now
      WHERE profile.id = v_generation.user_id
      RETURNING profile.credits INTO v_balance;
      IF v_balance IS NOT NULL THEN
        INSERT INTO public.credit_logs (user_id, amount, balance, reason, generation_id)
        VALUES (v_generation.user_id, v_refund, v_balance, '容量排队 watchdog 退款', v_generation.id);
      END IF;
    END IF;
    v_recovered := v_recovered + 1;
  END LOOP;
  RETURN v_recovered;
END;
$$;

REVOKE ALL ON FUNCTION public.recover_stale_generation_capacity_waits(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_stale_generation_capacity_waits(INTEGER) TO service_role;

ALTER TABLE public.generations
  ADD COLUMN IF NOT EXISTS tenant_capacity_defer_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.generations
  ADD COLUMN IF NOT EXISTS tenant_capacity_first_deferred_at TIMESTAMPTZ;

-- A dead transactional delivery must not strand a charged visible task. This
-- trigger covers both publisher nack exhaustion and recovery dead-lettering,
-- while the generation status/version fence makes the refund exactly once.
CREATE OR REPLACE FUNCTION private.fail_generation_on_dead_outbox()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_refund INTEGER;
  v_balance INTEGER;
BEGIN
  IF OLD.status = 'dead' OR NEW.status <> 'dead' THEN
    RETURN NEW;
  END IF;

  SELECT GREATEST(COALESCE(g.credits_used, g.credits_cost, 0), 0)
  INTO v_refund
  FROM public.generations AS g
  WHERE g.id = NEW.generation_id
    AND g.delivery_version = NEW.delivery_version
    AND g.status = 'queued'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  UPDATE public.generations AS g
  SET status = 'failed',
      queue_reason = 'dispatch_failed',
      error_message = '任务投递失败，积分已退还，请稍后重试',
      completed_at = COALESCE(g.completed_at, v_now),
      credits_used = 0,
      updated_at = v_now
  WHERE g.id = NEW.generation_id
    AND g.delivery_version = NEW.delivery_version
    AND g.status = 'queued';

  IF v_refund > 0 THEN
    UPDATE public.profiles AS p
    SET credits = p.credits + v_refund,
        total_credits_used = GREATEST(COALESCE(p.total_credits_used, 0) - v_refund, 0),
        updated_at = v_now
    WHERE p.id = NEW.user_id
    RETURNING p.credits INTO v_balance;

    IF v_balance IS NOT NULL THEN
      INSERT INTO public.credit_logs (user_id, amount, balance, reason, generation_id)
      VALUES (NEW.user_id, v_refund, v_balance, '任务投递失败退款', NEW.generation_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS generation_job_outbox_dead_settlement
  ON private.generation_job_outbox;
CREATE TRIGGER generation_job_outbox_dead_settlement
AFTER UPDATE OF status ON private.generation_job_outbox
FOR EACH ROW
WHEN (NEW.status = 'dead' AND OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION private.fail_generation_on_dead_outbox();

REVOKE ALL ON FUNCTION private.fail_generation_on_dead_outbox()
  FROM PUBLIC, anon, authenticated;

ALTER TABLE public.generations
  DROP CONSTRAINT IF EXISTS generations_service_tier_check;
ALTER TABLE public.generations
  ADD CONSTRAINT generations_service_tier_check
  CHECK (service_tier IN ('standard', 'vip'));

CREATE OR REPLACE FUNCTION private.resolve_generation_service_tier(p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM public.stripe_subscriptions AS subscription
    JOIN public.billing_products AS product
      ON product.id = subscription.product_id
    WHERE subscription.user_id = p_user_id
      AND subscription.status IN ('active', 'trialing')
      AND (
        subscription.current_period_end IS NULL
        OR subscription.current_period_end > now()
      )
      AND product.tier_key IN ('business', 'premium')
  ) THEN 'vip'::TEXT ELSE 'standard'::TEXT END;
$$;

REVOKE ALL ON FUNCTION private.resolve_generation_service_tier(UUID)
  FROM PUBLIC, anon, authenticated;

-- Preserve VIP priority for work which was already active when this migration
-- was installed. Terminal history remains standard because its queue tier is
-- no longer operationally relevant.
UPDATE public.generations AS g
SET service_tier = private.resolve_generation_service_tier(g.user_id)
WHERE g.status = 'queued' OR g.status LIKE 'processing_%';

CREATE INDEX IF NOT EXISTS generations_user_visible_active_admission_idx
  ON public.generations (user_id, status, created_at, id)
  WHERE (status = 'queued' OR status LIKE 'processing_%')
    AND COALESCE(job_payload ->> 'internalTask', 'false') <> 'true';

CREATE OR REPLACE FUNCTION private.assign_generation_service_tier_and_admit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_active_jobs INTEGER;
  v_limit INTEGER;
BEGIN
  -- Never trust a caller-supplied tier, including service-role callers.
  NEW.service_tier := private.resolve_generation_service_tier(NEW.user_id);

  IF NOT (NEW.status = 'queued' OR NEW.status LIKE 'processing_%')
    OR COALESCE(NEW.job_payload ->> 'internalTask', 'false') = 'true'
  THEN
    RETURN NEW;
  END IF;

  -- All visible submissions for one tenant serialize on the profile row.
  -- This makes count + insert exact while allowing different users to proceed.
  PERFORM 1
  FROM public.profiles AS profile
  WHERE profile.id = NEW.user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND' USING ERRCODE = '23503';
  END IF;

  v_limit := CASE WHEN NEW.service_tier = 'vip' THEN 30 ELSE 12 END;

  SELECT count(*)::INTEGER
  INTO v_active_jobs
  FROM public.generations AS generation
  WHERE generation.user_id = NEW.user_id
    AND (generation.status = 'queued' OR generation.status LIKE 'processing_%')
    AND COALESCE(generation.job_payload ->> 'internalTask', 'false') <> 'true';

  IF v_active_jobs >= v_limit THEN
    RAISE EXCEPTION 'ACTIVE_JOB_LIMIT_EXCEEDED:%:%', v_active_jobs, v_limit
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS generations_assign_service_tier_and_admit
  ON public.generations;
CREATE TRIGGER generations_assign_service_tier_and_admit
  BEFORE INSERT ON public.generations
  FOR EACH ROW
  EXECUTE FUNCTION private.assign_generation_service_tier_and_admit();

REVOKE ALL ON FUNCTION private.assign_generation_service_tier_and_admit()
  FROM PUBLIC, anon, authenticated;

-- Wrap the existing debit RPC so its lower, operator-controlled limit counts
-- visible jobs only. The trigger above remains the non-bypassable 12/30 cap.
ALTER FUNCTION public.create_generation_with_credit_debit_v2(
  UUID, TEXT[], TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, JSONB, TEXT, INTEGER
) SET SCHEMA private;

ALTER FUNCTION private.create_generation_with_credit_debit_v2(
  UUID, TEXT[], TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, JSONB, TEXT, INTEGER
) RENAME TO create_generation_with_credit_debit_v2_legacy;

REVOKE ALL ON FUNCTION private.create_generation_with_credit_debit_v2_legacy(
  UUID, TEXT[], TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, JSONB, TEXT, INTEGER
) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.create_generation_with_credit_debit_v2(
  p_user_id UUID,
  p_clothing_urls TEXT[],
  p_model_face_url TEXT DEFAULT NULL,
  p_reference_url TEXT DEFAULT NULL,
  p_credits_cost INTEGER DEFAULT 1,
  p_ai_model TEXT DEFAULT 'gpt-image-2',
  p_image_size TEXT DEFAULT '1K',
  p_reason TEXT DEFAULT '生成',
  p_job_payload JSONB DEFAULT '{}'::jsonb,
  p_idempotency_key TEXT DEFAULT NULL,
  p_max_active_jobs INTEGER DEFAULT 30
)
RETURNS TABLE(generation_id UUID, credits_remaining INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_internal_active_jobs INTEGER;
  v_service_limit INTEGER;
  v_effective_visible_limit INTEGER;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;
  IF p_max_active_jobs IS NULL OR p_max_active_jobs NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'INVALID_MAX_ACTIVE_JOBS' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(p_job_payload ->> 'internalTask', 'false') = 'true' THEN
    RAISE EXCEPTION 'INTERNAL_GENERATION_REQUIRES_TRUSTED_RPC' USING ERRCODE = '42501';
  END IF;

  -- Lock before measuring hidden children so the legacy total-count check is
  -- translated into an exact visible-count check under concurrent submission.
  PERFORM 1
  FROM public.profiles AS profile
  WHERE profile.id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND' USING ERRCODE = '23503';
  END IF;

  v_service_limit := CASE
    WHEN private.resolve_generation_service_tier(p_user_id) = 'vip' THEN 30
    ELSE 12
  END;
  v_effective_visible_limit := LEAST(p_max_active_jobs, v_service_limit);

  SELECT count(*)::INTEGER
  INTO v_internal_active_jobs
  FROM public.generations AS generation
  WHERE generation.user_id = p_user_id
    AND (generation.status = 'queued' OR generation.status LIKE 'processing_%')
    AND COALESCE(generation.job_payload ->> 'internalTask', 'false') = 'true';

  RETURN QUERY
  SELECT result.generation_id, result.credits_remaining
  FROM private.create_generation_with_credit_debit_v2_legacy(
    p_user_id,
    p_clothing_urls,
    p_model_face_url,
    p_reference_url,
    p_credits_cost,
    p_ai_model,
    p_image_size,
    p_reason,
    p_job_payload,
    p_idempotency_key,
    LEAST(1000, v_effective_visible_limit + v_internal_active_jobs)
  ) AS result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_generation_with_credit_debit_v2(
  UUID, TEXT[], TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, JSONB, TEXT, INTEGER
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_generation_with_credit_debit_v2(
  UUID, TEXT[], TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, JSONB, TEXT, INTEGER
) TO authenticated;

DROP FUNCTION public.claim_generation_job(UUID, INTEGER, UUID, INTEGER);

CREATE FUNCTION public.claim_generation_job(
  p_generation_id UUID,
  p_delivery_version INTEGER,
  p_execution_token UUID,
  p_lease_seconds INTEGER DEFAULT 45
)
RETURNS TABLE(
  id UUID,
  user_id UUID,
  job_payload JSONB,
  credits_cost INTEGER,
  job_attempts INTEGER,
  service_tier TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF p_delivery_version < 1 OR p_execution_token IS NULL
    OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 15 AND 300 THEN
    RAISE EXCEPTION 'INVALID_GENERATION_CLAIM' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  UPDATE public.generations AS generation
  SET status = 'processing_tryon',
      processing_started_at = v_now,
      execution_token = p_execution_token,
      execution_lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
      job_attempts = COALESCE(generation.job_attempts, 0) + 1,
      error_message = NULL
  WHERE generation.id = p_generation_id
    AND generation.delivery_version = p_delivery_version
    AND generation.available_at <= v_now
    AND (
      generation.status = 'queued'
      OR (
        generation.status = 'processing_tryon'
        AND generation.execution_lease_expires_at <= v_now
      )
    )
  RETURNING
    generation.id,
    generation.user_id,
    generation.job_payload,
    generation.credits_cost,
    generation.job_attempts,
    generation.service_tier;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_generation_job(UUID, INTEGER, UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_generation_job(UUID, INTEGER, UUID, INTEGER)
  TO service_role;

DROP FUNCTION public.claim_generation_outbox(INTEGER, INTEGER);

CREATE FUNCTION public.claim_generation_outbox(
  p_limit INTEGER DEFAULT 50,
  p_lease_seconds INTEGER DEFAULT 60
)
RETURNS TABLE(
  outbox_id UUID,
  generation_id UUID,
  delivery_version INTEGER,
  delivery_key TEXT,
  available_at TIMESTAMPTZ,
  lease_token UUID,
  attempts INTEGER,
  service_tier TEXT,
  queue_priority INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_candidate_limit INTEGER;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500
    OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 15 AND 600 THEN
    RAISE EXCEPTION 'INVALID_OUTBOX_CLAIM' USING ERRCODE = '22023';
  END IF;
  -- The floor exceeds the largest per-user visible backlog (VIP=30), so one
  -- noisy tenant cannot occupy the entire sample even when p_limit is small.
  v_candidate_limit := LEAST(GREATEST(p_limit * 16, 64), 8000);

  RETURN QUERY
  WITH pending_sample AS MATERIALIZED (
    SELECT
      outbox.id,
      outbox.user_id,
      outbox.available_at,
      outbox.created_at,
      outbox.available_at AS ready_at
    FROM private.generation_job_outbox AS outbox
    WHERE outbox.status = 'pending'
      AND outbox.attempts < outbox.max_attempts
      AND outbox.available_at <= v_now
    ORDER BY outbox.available_at, outbox.created_at, outbox.id
    LIMIT v_candidate_limit
  ),
  expired_lease_sample AS MATERIALIZED (
    SELECT
      outbox.id,
      outbox.user_id,
      outbox.available_at,
      outbox.created_at,
      outbox.lease_expires_at AS ready_at
    FROM private.generation_job_outbox AS outbox
    WHERE outbox.status = 'publishing'
      AND outbox.attempts < outbox.max_attempts
      AND outbox.lease_expires_at <= v_now
    ORDER BY outbox.lease_expires_at, outbox.created_at, outbox.id
    LIMIT v_candidate_limit
  ),
  bounded_ready AS MATERIALIZED (
    SELECT sampled.*
    FROM (
      SELECT pending.* FROM pending_sample AS pending
      UNION ALL
      SELECT expired.* FROM expired_lease_sample AS expired
    ) AS sampled
    ORDER BY sampled.ready_at, sampled.created_at, sampled.id
    LIMIT v_candidate_limit
  ),
  tenant_ranked AS MATERIALIZED (
    SELECT
      ready.id,
      ready.available_at,
      ready.created_at,
      ready.ready_at,
      row_number() OVER (
        PARTITION BY ready.user_id
        ORDER BY ready.ready_at, ready.created_at, ready.id
      ) AS tenant_rank
    FROM bounded_ready AS ready
  ),
  candidates AS (
    SELECT outbox.id, outbox.generation_id
    FROM tenant_ranked AS ranked
    JOIN private.generation_job_outbox AS outbox
      ON outbox.id = ranked.id
    WHERE outbox.attempts < outbox.max_attempts
      AND (
        (outbox.status = 'pending' AND outbox.available_at <= v_now)
        OR (outbox.status = 'publishing' AND outbox.lease_expires_at <= v_now)
      )
    ORDER BY ranked.tenant_rank, ranked.ready_at, ranked.created_at, ranked.id
    LIMIT p_limit
    FOR UPDATE OF outbox SKIP LOCKED
  )
  UPDATE private.generation_job_outbox AS outbox
  SET status = 'publishing',
      attempts = outbox.attempts + 1,
      lease_token = gen_random_uuid(),
      lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
      updated_at = v_now,
      last_error = NULL
  FROM candidates
  JOIN public.generations AS generation
    ON generation.id = candidates.generation_id
  WHERE outbox.id = candidates.id
  RETURNING
    outbox.id,
    outbox.generation_id,
    outbox.delivery_version,
    outbox.delivery_key,
    outbox.available_at,
    outbox.lease_token,
    outbox.attempts,
    generation.service_tier,
    CASE
      WHEN generation.service_tier = 'standard'
        AND generation.created_at <= v_now - interval '2 minutes' THEN 5
      WHEN generation.service_tier = 'vip' THEN 2
      ELSE 20
    END;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_generation_outbox(INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_generation_outbox(INTEGER, INTEGER)
  TO service_role;

CREATE OR REPLACE FUNCTION public.get_generation_service_entitlement()
RETURNS TABLE(
  service_tier TEXT,
  max_active_jobs INTEGER,
  max_user_provider_concurrency INTEGER,
  max_user_deployment_concurrency INTEGER,
  max_generation_image_concurrency INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_tier TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '42501';
  END IF;

  v_tier := private.resolve_generation_service_tier(v_user_id);
  RETURN QUERY SELECT
    v_tier,
    CASE WHEN v_tier = 'vip' THEN 30 ELSE 12 END,
    CASE WHEN v_tier = 'vip' THEN 8 ELSE 4 END,
    CASE WHEN v_tier = 'vip' THEN 4 ELSE 2 END,
    CASE WHEN v_tier = 'vip' THEN 4 ELSE 2 END;
END;
$$;

REVOKE ALL ON FUNCTION public.get_generation_service_entitlement()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_generation_service_entitlement()
  TO authenticated;

-- Capacity saturation remains a queue state, but waiting is bounded to about
-- ten minutes. Capacity checks never consume a generation retry attempt.
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

  SELECT generation.*
  INTO v_generation
  FROM public.generations AS generation
  WHERE generation.id = p_generation_id
    AND generation.user_id = p_user_id
    AND generation.status = 'processing_tryon'
    AND generation.delivery_version = p_delivery_version
    AND generation.execution_token = p_execution_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'STALE_EXECUTION_FENCE' USING ERRCODE = '40001';
  END IF;

  v_next_count := COALESCE(v_generation.capacity_defer_count, 0) + 1;
  -- Share the same wall-clock SLA with tenant fairness waits.
  v_first_deferred_at := COALESCE(
    v_generation.capacity_first_deferred_at,
    v_generation.tenant_capacity_first_deferred_at,
    v_now
  );

  IF v_first_deferred_at <= v_now - interval '10 minutes' THEN
    v_refund_amount := private.generation_uncompleted_refund(
      COALESCE(v_generation.credits_used, v_generation.credits_cost, 0),
      v_generation.result_urls,
      v_generation.job_payload
    );

    UPDATE public.generations AS generation
    SET status = 'failed',
        error_message = left(
          '模型供应商容量持续不可用，排队等待已超过上限，灵点已退还',
          1000
        ),
        queue_reason = NULL,
        capacity_defer_count = v_next_count,
        capacity_first_deferred_at = NULL,
        tenant_capacity_first_deferred_at = NULL,
        processing_started_at = NULL,
        execution_token = NULL,
        execution_lease_expires_at = NULL,
        completed_at = COALESCE(generation.completed_at, v_now),
        credits_used = 0,
        updated_at = v_now
    WHERE generation.id = v_generation.id;

    SELECT profile.credits INTO v_balance
    FROM public.profiles AS profile
    WHERE profile.id = v_generation.user_id;

    IF v_refund_amount > 0 THEN
      UPDATE public.profiles AS profile
      SET credits = profile.credits + v_refund_amount,
          total_credits_used = GREATEST(COALESCE(profile.total_credits_used, 0) - v_refund_amount, 0),
          updated_at = v_now
      WHERE profile.id = v_generation.user_id
      RETURNING profile.credits INTO v_balance;

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
    60,
    GREATEST(p_delay_seconds, 5) * power(2, LEAST(v_next_count - 1, 6))::INTEGER
  );
  v_effective_delay := LEAST(
    60,
    GREATEST(5, floor(v_backoff_seconds * (0.75 + random() * 0.5))::INTEGER)
  );

  UPDATE public.generations AS generation
  SET status = 'queued',
      processing_started_at = NULL,
      delivery_version = generation.delivery_version + 1,
      available_at = v_now + make_interval(secs => v_effective_delay),
      execution_token = NULL,
      execution_lease_expires_at = NULL,
      job_attempts = GREATEST(COALESCE(generation.job_attempts, 0) - 1, 0),
      queue_reason = 'provider_capacity',
      capacity_defer_count = v_next_count,
      capacity_first_deferred_at = v_first_deferred_at,
      tenant_capacity_first_deferred_at = v_first_deferred_at,
      error_message = NULL,
      completed_at = NULL,
      updated_at = v_now
  WHERE generation.id = v_generation.id
  RETURNING generation.* INTO v_generation;

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

REVOKE ALL ON FUNCTION public.settle_generation_for_ai_capacity(
  UUID, UUID, INTEGER, UUID, INTEGER, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_generation_for_ai_capacity(
  UUID, UUID, INTEGER, UUID, INTEGER, TEXT
) TO service_role;

-- A tenant fairness wait is not a provider outage. It must never consume the
-- provider-capacity timeout budget or refund a healthy-provider task merely
-- because the same account already owns its fair share of execution slots.
CREATE OR REPLACE FUNCTION public.settle_generation_for_tenant_capacity(
  p_generation_id UUID,
  p_user_id UUID,
  p_delivery_version INTEGER,
  p_execution_token UUID,
  p_delay_seconds INTEGER DEFAULT 15,
  p_reason TEXT DEFAULT 'Tenant concurrency limit is temporarily full'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_generation public.generations%ROWTYPE;
  v_effective_delay INTEGER;
  v_first_deferred_at TIMESTAMPTZ;
  v_refund_amount INTEGER;
  v_balance INTEGER;
BEGIN
  IF COALESCE((SELECT auth.role()), '') <> 'service_role' THEN
    RAISE EXCEPTION 'GENERATION_TENANT_CAPACITY_SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_delay_seconds IS NULL OR p_delay_seconds NOT BETWEEN 5 AND 60 THEN
    RAISE EXCEPTION 'INVALID_TENANT_CAPACITY_DELAY' USING ERRCODE = '22023';
  END IF;

  SELECT generation.*
  INTO v_generation
  FROM public.generations AS generation
  WHERE generation.id = p_generation_id
    AND generation.user_id = p_user_id
    AND generation.status = 'processing_tryon'
    AND generation.delivery_version = p_delivery_version
    AND generation.execution_token = p_execution_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'STALE_EXECUTION_FENCE' USING ERRCODE = '40001';
  END IF;

  -- One wall-clock SLA spans tenant and provider backpressure. A task that
  -- alternates between both queues must not receive two separate 10m budgets.
  v_first_deferred_at := COALESCE(
    v_generation.tenant_capacity_first_deferred_at,
    v_generation.capacity_first_deferred_at,
    v_now
  );
  IF v_first_deferred_at <= v_now - interval '10 minutes' THEN
    v_refund_amount := private.generation_uncompleted_refund(
      COALESCE(v_generation.credits_used, v_generation.credits_cost, 0),
      v_generation.result_urls,
      v_generation.job_payload
    );
    UPDATE public.generations AS generation
    SET status = 'failed',
        error_message = '账户并发长期满载，排队等待已超过上限，灵点已退还',
        queue_reason = NULL,
        tenant_capacity_defer_count = COALESCE(generation.tenant_capacity_defer_count, 0) + 1,
        tenant_capacity_first_deferred_at = NULL,
        capacity_first_deferred_at = NULL,
        processing_started_at = NULL,
        execution_token = NULL,
        execution_lease_expires_at = NULL,
        completed_at = COALESCE(generation.completed_at, v_now),
        credits_used = 0,
        updated_at = v_now
    WHERE generation.id = v_generation.id;
    IF v_refund_amount > 0 THEN
      UPDATE public.profiles AS profile
      SET credits = profile.credits + v_refund_amount,
          total_credits_used = GREATEST(COALESCE(profile.total_credits_used, 0) - v_refund_amount, 0),
          updated_at = v_now
      WHERE profile.id = v_generation.user_id
      RETURNING profile.credits INTO v_balance;
      IF v_balance IS NOT NULL THEN
        INSERT INTO public.credit_logs (user_id, amount, balance, reason, generation_id)
        VALUES (v_generation.user_id, v_refund_amount, v_balance, '账户并发排队超时退款', v_generation.id);
      END IF;
    END IF;
    RETURN 'failed';
  END IF;

  v_effective_delay := LEAST(60, GREATEST(5,
    floor(GREATEST(p_delay_seconds, 5) * (0.75 + random() * 0.5))::INTEGER
  ));

  UPDATE public.generations AS generation
  SET status = 'queued',
      processing_started_at = NULL,
      delivery_version = generation.delivery_version + 1,
      available_at = v_now + make_interval(secs => v_effective_delay),
      execution_token = NULL,
      execution_lease_expires_at = NULL,
      -- Fairness waits do not consume provider/business execution attempts.
      job_attempts = GREATEST(COALESCE(generation.job_attempts, 0) - 1, 0),
      queue_reason = 'tenant_capacity',
      tenant_capacity_defer_count = COALESCE(generation.tenant_capacity_defer_count, 0) + 1,
      tenant_capacity_first_deferred_at = v_first_deferred_at,
      capacity_first_deferred_at = v_first_deferred_at,
      error_message = NULL,
      completed_at = NULL,
      updated_at = v_now
  WHERE generation.id = v_generation.id
  RETURNING generation.* INTO v_generation;

  INSERT INTO private.generation_job_outbox (
    generation_id, user_id, delivery_version, delivery_key,
    idempotency_key, payload, available_at, last_error
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
    left(COALESCE(NULLIF(btrim(p_reason), ''), 'tenant concurrency wait'), 1000)
  )
  ON CONFLICT (generation_id, delivery_version) DO NOTHING;

  RETURN 'deferred';
END;
$$;

REVOKE ALL ON FUNCTION public.settle_generation_for_tenant_capacity(
  UUID, UUID, INTEGER, UUID, INTEGER, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_generation_for_tenant_capacity(
  UUID, UUID, INTEGER, UUID, INTEGER, TEXT
) TO service_role;

-- The legacy recovery function used a default of 10. Keep its implementation
-- private and expose one bounded public entry point so manual/admin invocations
-- cannot silently bypass the generation execution budget of two attempts.
ALTER FUNCTION public.recover_generation_outbox(INTEGER, INTEGER) SET SCHEMA private;
ALTER FUNCTION private.recover_generation_outbox(INTEGER, INTEGER)
  RENAME TO recover_generation_outbox_legacy;

CREATE FUNCTION public.recover_generation_outbox(
  p_limit INTEGER DEFAULT 500,
  p_max_execution_attempts INTEGER DEFAULT 2
)
RETURNS TABLE(
  recovered_leases INTEGER,
  repaired_missing INTEGER,
  dead_lettered INTEGER,
  redriven_published INTEGER,
  cleaned_retention INTEGER,
  recovered_executions INTEGER,
  failed_executions INTEGER,
  refunded_credits BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_max_execution_attempts IS NULL OR p_max_execution_attempts NOT BETWEEN 1 AND 2 THEN
    RAISE EXCEPTION 'INVALID_MAX_EXECUTION_ATTEMPTS' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  SELECT *
  FROM private.recover_generation_outbox_legacy(p_limit, p_max_execution_attempts);
END;
$$;

REVOKE ALL ON FUNCTION public.recover_generation_outbox(INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_generation_outbox(INTEGER, INTEGER)
  TO service_role;

-- sha256 of:
-- wanxiang-runtime-contract|2026-08-22.6|generation-service-entitlements-v1|generation-tiered-outbox-priority-v1|generation-capacity-backpressure-v2|generation-tenant-backpressure-v1|tenant-wait-sla-v1|generation-retryable-backpressure-v1|provider-account-capacity-v2|image-idempotency-v1|worker-shutdown-fence-v1|admin-generation-requeue-v1|admin-generation-settlement-v1|generation-outbox-bounded-fair-fenced-recovery-redrive-v5|oss-mirror-fenced-media-bridge-v2|media-registry-validation-v2|cleanup-linearized-v2|generation-links-retention-v1|stale-capacity-watchdog-v1|partial-refund-v1
CREATE OR REPLACE FUNCTION public.get_runtime_contract_version()
RETURNS TABLE(contract_version TEXT, contract_hash TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    '2026-08-22.6'::TEXT,
    'f6989e953f92e638603f8369bf5d10cbfb651dfc8145417ccb096ef1a40aeedf'::TEXT;
$$;

COMMIT;
