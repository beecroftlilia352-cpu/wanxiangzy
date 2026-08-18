-- BullMQ generation outbox (clean-slate migration).
--
-- Durable contract:
--   PostgreSQL transaction -> private outbox -> at-least-once BullMQ publish.
-- Generation execution is fenced by delivery_version + execution_token.

-- Preserve the immutable credit ledger before deleting unpublished task data.
UPDATE public.credit_logs
SET generation_id = NULL
WHERE generation_id IS NOT NULL;

DO $$
BEGIN
  IF to_regclass('public.task_queue_items') IS NOT NULL THEN
    DELETE FROM public.task_queue_items
    WHERE source_type = 'generation';
  END IF;
END;
$$;

-- Product-retouch children cascade; AI-tool/resource references use SET NULL.
DELETE FROM public.generations;

DROP FUNCTION IF EXISTS public.claim_generation_job(UUID, INTERVAL);
DROP FUNCTION IF EXISTS public.claim_next_generation_jobs(INTEGER, INTERVAL);
DROP FUNCTION IF EXISTS public.defer_generation_for_ai_capacity(UUID, UUID, INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.fail_generation_with_credit_refund(UUID, UUID, INTEGER, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.complete_generation_with_credit_adjustment(UUID, UUID, TEXT[], JSONB, INTEGER, INTEGER, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.create_generation_with_credit_debit(UUID, TEXT[], TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.get_generation_queue_health();
DROP FUNCTION IF EXISTS public.create_generation_with_credit_debit_v2(UUID, TEXT[], TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, JSONB, TEXT);
DROP FUNCTION IF EXISTS public.create_generation_with_credit_debit_v2(UUID, TEXT[], TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, JSONB, TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.claim_generation_outbox(INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.confirm_generation_outbox(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.nack_generation_outbox(UUID, UUID, TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.recover_generation_outbox(INTEGER);
DROP FUNCTION IF EXISTS public.recover_generation_outbox(INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.redrive_generation_outbox(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.claim_generation_job(UUID, INTEGER, UUID, INTEGER);
DROP FUNCTION IF EXISTS public.heartbeat_generation_job(UUID, INTEGER, UUID, INTEGER);
DROP FUNCTION IF EXISTS public.defer_generation_for_ai_capacity(UUID, UUID, INTEGER, UUID, INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.fail_generation_with_credit_refund(UUID, UUID, INTEGER, INTEGER, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.complete_generation_with_credit_adjustment(UUID, UUID, TEXT[], INTEGER, UUID, JSONB, INTEGER, INTEGER, TEXT, TEXT);
DROP TRIGGER IF EXISTS generations_prepare_bullmq_delivery ON public.generations;
DROP TRIGGER IF EXISTS generations_insert_bullmq_outbox ON public.generations;
DROP FUNCTION IF EXISTS private.prepare_generation_bullmq_delivery();
DROP FUNCTION IF EXISTS private.insert_generation_bullmq_outbox();

DROP TRIGGER IF EXISTS generations_set_queue_state ON public.generations;
DROP FUNCTION IF EXISTS public.set_generation_queue_state();

DROP INDEX IF EXISTS public.generations_job_queue_idx;
DROP INDEX IF EXISTS public.generations_job_ready_idx;
DROP INDEX IF EXISTS public.generations_queue_claim_idx;
DROP INDEX IF EXISTS public.generations_capacity_defer_observe_idx;

ALTER TABLE public.generations
  DROP COLUMN IF EXISTS next_attempt_at,
  DROP COLUMN IF EXISTS queue_priority,
  DROP COLUMN IF EXISTS queued_at,
  DROP COLUMN IF EXISTS queue_available_at,
  DROP COLUMN IF EXISTS lease_expires_at,
  DROP COLUMN IF EXISTS claim_count,
  DROP COLUMN IF EXISTS capacity_defer_count,
  DROP COLUMN IF EXISTS last_claimed_at,
  DROP COLUMN IF EXISTS last_capacity_deferred_at,
  DROP COLUMN IF EXISTS last_capacity_reason,
  DROP COLUMN IF EXISTS last_queue_wait_ms,
  DROP COLUMN IF EXISTS total_queue_wait_ms;

ALTER TABLE public.generations
  ADD COLUMN IF NOT EXISTS request_idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS request_fingerprint JSONB,
  ADD COLUMN IF NOT EXISTS credits_remaining_after_debit INTEGER,
  ADD COLUMN IF NOT EXISTS delivery_version INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS execution_token UUID,
  ADD COLUMN IF NOT EXISTS execution_lease_expires_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'generations_bullmq_delivery_version_chk'
      AND conrelid = 'public.generations'::regclass
  ) THEN
    ALTER TABLE public.generations
      ADD CONSTRAINT generations_bullmq_delivery_version_chk
      CHECK (delivery_version >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'generations_bullmq_execution_fence_chk'
      AND conrelid = 'public.generations'::regclass
  ) THEN
    ALTER TABLE public.generations
      ADD CONSTRAINT generations_bullmq_execution_fence_chk
      CHECK (
        (execution_token IS NULL AND execution_lease_expires_at IS NULL)
        OR (execution_token IS NOT NULL AND execution_lease_expires_at IS NOT NULL)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'generations_bullmq_idempotency_pair_chk'
      AND conrelid = 'public.generations'::regclass
  ) THEN
    ALTER TABLE public.generations
      ADD CONSTRAINT generations_bullmq_idempotency_pair_chk
      CHECK (
        (request_idempotency_key IS NULL AND request_fingerprint IS NULL)
        OR (request_idempotency_key IS NOT NULL AND request_fingerprint IS NOT NULL)
      );
  END IF;
END;
$$;

-- The v2 RPC is the only write path for new generation tasks.
DROP POLICY IF EXISTS "Users can insert own generations" ON public.generations;
REVOKE INSERT ON public.generations FROM PUBLIC, anon, authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS generations_user_idempotency_uidx
  ON public.generations (user_id, request_idempotency_key)
  WHERE request_idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS generations_user_active_admission_idx
  ON public.generations (user_id, status, created_at, id)
  WHERE status = 'queued' OR status LIKE 'processing_%';

CREATE INDEX IF NOT EXISTS generations_execution_recovery_idx
  ON public.generations (execution_lease_expires_at, available_at, created_at, id)
  WHERE status = 'processing_tryon';

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;

DROP TABLE IF EXISTS private.generation_outbox_redrive_audit;
DROP TABLE IF EXISTS private.generation_job_outbox;

CREATE TABLE private.generation_job_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id UUID NOT NULL REFERENCES public.generations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL DEFAULT 'generation.requested'
    CHECK (event_type = 'generation.requested'),
  delivery_version INTEGER NOT NULL CHECK (delivery_version >= 1),
  delivery_key TEXT NOT NULL CHECK (char_length(delivery_key) BETWEEN 20 AND 160),
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 160),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'publishing', 'published', 'dead')),
  available_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 100),
  max_attempts INTEGER NOT NULL DEFAULT 25 CHECK (max_attempts BETWEEN 1 AND 100),
  lease_token UUID,
  lease_expires_at TIMESTAMPTZ,
  bullmq_job_id TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  CONSTRAINT generation_job_outbox_generation_delivery_uidx
    UNIQUE (generation_id, delivery_version),
  CONSTRAINT generation_job_outbox_user_idempotency_delivery_uidx
    UNIQUE (user_id, idempotency_key, delivery_version),
  CONSTRAINT generation_job_outbox_delivery_key_uidx UNIQUE (delivery_key),
  CONSTRAINT generation_job_outbox_lease_state_chk CHECK (
    (status = 'publishing' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR (status <> 'publishing' AND lease_token IS NULL AND lease_expires_at IS NULL)
  ),
  CONSTRAINT generation_job_outbox_published_state_chk CHECK (
    (status = 'published' AND published_at IS NOT NULL AND bullmq_job_id IS NOT NULL)
    OR (status <> 'published' AND published_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS generation_job_outbox_pending_claim_idx
  ON private.generation_job_outbox (available_at, created_at, id)
  INCLUDE (user_id)
  WHERE status = 'pending' AND attempts < max_attempts;

CREATE INDEX IF NOT EXISTS generation_job_outbox_expired_lease_idx
  ON private.generation_job_outbox (lease_expires_at, created_at, id)
  INCLUDE (user_id, available_at)
  WHERE status = 'publishing' AND attempts < max_attempts;

CREATE INDEX IF NOT EXISTS generation_job_outbox_retention_idx
  ON private.generation_job_outbox (published_at, id)
  WHERE status IN ('published', 'dead');

CREATE INDEX IF NOT EXISTS generation_job_outbox_dead_retention_idx
  ON private.generation_job_outbox (updated_at, id)
  WHERE status = 'dead';

ALTER TABLE private.generation_job_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.generation_job_outbox FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.generation_job_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON private.generation_job_outbox TO service_role;

CREATE TABLE private.generation_outbox_redrive_audit (
  redrive_id UUID PRIMARY KEY,
  outbox_id UUID NOT NULL,
  generation_id UUID NOT NULL,
  user_id UUID NOT NULL,
  delivery_version INTEGER NOT NULL CHECK (delivery_version >= 1),
  previous_attempts INTEGER NOT NULL CHECK (previous_attempts >= 0),
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 8 AND 1000),
  requested_by UUID,
  available_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX generation_outbox_redrive_audit_outbox_idx
  ON private.generation_outbox_redrive_audit (outbox_id, created_at DESC);
CREATE INDEX generation_outbox_redrive_audit_generation_idx
  ON private.generation_outbox_redrive_audit (generation_id, created_at DESC);

ALTER TABLE private.generation_outbox_redrive_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.generation_outbox_redrive_audit FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.generation_outbox_redrive_audit
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.prepare_generation_bullmq_delivery()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status <> 'queued' THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS NULL THEN
    NEW.id := gen_random_uuid();
  END IF;
  NEW.delivery_version := GREATEST(COALESCE(NEW.delivery_version, 0), 1);
  NEW.available_at := COALESCE(NEW.available_at, clock_timestamp());
  NEW.request_idempotency_key := COALESCE(
    NULLIF(btrim(NEW.request_idempotency_key), ''),
    'internal-generation-' || NEW.id::TEXT
  );
  NEW.request_fingerprint := COALESCE(
    NEW.request_fingerprint,
    jsonb_build_object(
      'source', 'trusted-sql-generation-insert',
      'generationId', NEW.id,
      'jobPayload', COALESCE(NEW.job_payload, '{}'::jsonb)
    )
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.insert_generation_bullmq_outbox()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status <> 'queued' THEN
    RETURN NEW;
  END IF;

  INSERT INTO private.generation_job_outbox (
    generation_id,
    user_id,
    delivery_version,
    delivery_key,
    idempotency_key,
    payload,
    available_at
  )
  VALUES (
    NEW.id,
    NEW.user_id,
    NEW.delivery_version,
    'generation-' || NEW.id::TEXT || '-v' || NEW.delivery_version::TEXT,
    NEW.request_idempotency_key,
    jsonb_build_object(
      'schemaVersion', 1,
      'generationId', NEW.id,
      'deliveryVersion', NEW.delivery_version
    ),
    NEW.available_at
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER generations_prepare_bullmq_delivery
  BEFORE INSERT ON public.generations
  FOR EACH ROW EXECUTE FUNCTION private.prepare_generation_bullmq_delivery();

CREATE TRIGGER generations_insert_bullmq_outbox
  AFTER INSERT ON public.generations
  FOR EACH ROW EXECUTE FUNCTION private.insert_generation_bullmq_outbox();

REVOKE ALL ON FUNCTION private.prepare_generation_bullmq_delivery()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.insert_generation_bullmq_outbox()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_generation_with_credit_debit_v2(
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
  p_max_active_jobs INTEGER DEFAULT 20
)
RETURNS TABLE(generation_id UUID, credits_remaining INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_balance INTEGER;
  v_generation_id UUID;
  v_existing_fingerprint JSONB;
  v_fingerprint JSONB;
  v_idempotency_key TEXT := btrim(COALESCE(p_idempotency_key, ''));
  v_reason TEXT := COALESCE(NULLIF(btrim(p_reason), ''), '生成');
  v_profile_balance INTEGER;
  v_active_jobs INTEGER;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  IF char_length(v_idempotency_key) NOT BETWEEN 8 AND 160 THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY' USING ERRCODE = '22023';
  END IF;

  IF p_credits_cost <= 0 OR p_credits_cost > 1000000 THEN
    RAISE EXCEPTION 'INVALID_CREDIT_AMOUNT' USING ERRCODE = '22023';
  END IF;

  IF p_max_active_jobs IS NULL OR p_max_active_jobs NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'INVALID_MAX_ACTIVE_JOBS' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(COALESCE(p_job_payload, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_JOB_PAYLOAD' USING ERRCODE = '22023';
  END IF;

  v_fingerprint := jsonb_build_object(
    'clothingUrls', to_jsonb(COALESCE(p_clothing_urls, ARRAY[]::TEXT[])),
    'modelFaceUrl', p_model_face_url,
    'referenceUrl', p_reference_url,
    'creditsCost', p_credits_cost,
    'aiModel', p_ai_model,
    'imageSize', p_image_size,
    'reason', v_reason,
    'jobPayload', COALESCE(p_job_payload, '{}'::jsonb)
  );

  -- Idempotent replay bypasses admission control. A request that was already
  -- accepted remains readable while the tenant is at its active-job cap.
  SELECT
    g.id,
    g.request_fingerprint,
    g.credits_remaining_after_debit
  INTO
    v_generation_id,
    v_existing_fingerprint,
    v_balance
  FROM public.generations AS g
  WHERE g.user_id = p_user_id
    AND g.request_idempotency_key = v_idempotency_key;

  IF v_generation_id IS NOT NULL THEN
    IF v_existing_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE = '22023';
    END IF;

    IF v_balance IS NULL THEN
      RAISE EXCEPTION 'IDEMPOTENCY_RESULT_INCOMPLETE' USING ERRCODE = '40001';
    END IF;

    RETURN QUERY SELECT v_generation_id, v_balance;
    RETURN;
  END IF;

  -- Per-tenant admission serialization: different users remain independent,
  -- while all compliant submissions for one user take the same profile lock.
  SELECT p.credits
  INTO v_profile_balance
  FROM public.profiles AS p
  WHERE p.id = p_user_id
  FOR UPDATE;

  IF v_profile_balance IS NULL THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND' USING ERRCODE = '23503';
  END IF;

  -- Re-check after waiting for the tenant lock. A concurrent request with this
  -- key may have committed while the current transaction was blocked.
  SELECT
    g.id,
    g.request_fingerprint,
    g.credits_remaining_after_debit
  INTO
    v_generation_id,
    v_existing_fingerprint,
    v_balance
  FROM public.generations AS g
  WHERE g.user_id = p_user_id
    AND g.request_idempotency_key = v_idempotency_key;

  IF v_generation_id IS NOT NULL THEN
    IF v_existing_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE = '22023';
    END IF;

    IF v_balance IS NULL THEN
      RAISE EXCEPTION 'IDEMPOTENCY_RESULT_INCOMPLETE' USING ERRCODE = '40001';
    END IF;

    RETURN QUERY SELECT v_generation_id, v_balance;
    RETURN;
  END IF;

  SELECT count(*)::INTEGER
  INTO v_active_jobs
  FROM public.generations AS g
  WHERE g.user_id = p_user_id
    AND (g.status = 'queued' OR g.status LIKE 'processing_%');

  IF v_active_jobs >= p_max_active_jobs THEN
    RAISE EXCEPTION 'ACTIVE_JOB_LIMIT_EXCEEDED:%:%', v_active_jobs, p_max_active_jobs
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.generations (
    user_id,
    clothing_urls,
    model_face_url,
    reference_url,
    status,
    credits_used,
    credits_cost,
    ai_model,
    image_size,
    job_payload,
    request_idempotency_key,
    request_fingerprint,
    delivery_version,
    available_at
  )
  VALUES (
    p_user_id,
    COALESCE(p_clothing_urls, ARRAY[]::TEXT[]),
    p_model_face_url,
    p_reference_url,
    'queued',
    p_credits_cost,
    p_credits_cost,
    p_ai_model,
    p_image_size,
    COALESCE(p_job_payload, '{}'::jsonb),
    v_idempotency_key,
    v_fingerprint,
    1,
    v_now
  )
  RETURNING id INTO v_generation_id;

  UPDATE public.profiles AS p
  SET credits = p.credits - p_credits_cost,
      total_credits_used = COALESCE(p.total_credits_used, 0) + p_credits_cost,
      updated_at = v_now
  WHERE p.id = p_user_id
    AND p.credits >= p_credits_cost
  RETURNING p.credits INTO v_balance;

  IF v_balance IS NULL THEN
    SELECT p.credits
    INTO v_balance
    FROM public.profiles AS p
    WHERE p.id = p_user_id;

    RAISE EXCEPTION 'INSUFFICIENT_CREDITS:%', COALESCE(v_balance, 0)
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.generations AS g
  SET credits_remaining_after_debit = v_balance
  WHERE g.id = v_generation_id;

  INSERT INTO public.credit_logs (
    user_id,
    amount,
    balance,
    reason,
    generation_id
  )
  VALUES (
    p_user_id,
    -p_credits_cost,
    v_balance,
    v_reason,
    v_generation_id
  );

  RETURN QUERY SELECT v_generation_id, v_balance;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_generation_outbox(
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
  attempts INTEGER
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
  -- Bound both memory and sort work independently of total backlog. At the
  -- largest public batch (500), the tenant window sees at most 8,000 rows.
  v_candidate_limit := LEAST(p_limit * 16, 8000);

  RETURN QUERY
  WITH pending_sample AS MATERIALIZED (
    SELECT
      o.id,
      o.user_id,
      o.available_at,
      o.created_at,
      o.available_at AS ready_at
    FROM private.generation_job_outbox AS o
    WHERE o.status = 'pending'
      AND o.attempts < o.max_attempts
      AND o.available_at <= v_now
    ORDER BY o.available_at, o.created_at, o.id
    LIMIT v_candidate_limit
  ),
  expired_lease_sample AS MATERIALIZED (
    SELECT
      o.id,
      o.user_id,
      o.available_at,
      o.created_at,
      o.lease_expires_at AS ready_at
    FROM private.generation_job_outbox AS o
    WHERE o.status = 'publishing'
      AND o.attempts < o.max_attempts
      AND o.lease_expires_at <= v_now
    ORDER BY o.lease_expires_at, o.created_at, o.id
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
    SELECT o.id
    FROM tenant_ranked AS ranked
    JOIN private.generation_job_outbox AS o
      ON o.id = ranked.id
    WHERE o.attempts < o.max_attempts
      AND (
        (o.status = 'pending' AND o.available_at <= v_now)
        OR (o.status = 'publishing' AND o.lease_expires_at <= v_now)
      )
    ORDER BY ranked.tenant_rank, ranked.ready_at, ranked.created_at, ranked.id
    LIMIT p_limit
    FOR UPDATE OF o SKIP LOCKED
  )
  UPDATE private.generation_job_outbox AS o
  SET status = 'publishing',
      attempts = o.attempts + 1,
      lease_token = gen_random_uuid(),
      lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
      updated_at = v_now,
      last_error = NULL
  FROM candidates
  WHERE o.id = candidates.id
  RETURNING
    o.id,
    o.generation_id,
    o.delivery_version,
    o.delivery_key,
    o.available_at,
    o.lease_token,
    o.attempts;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_generation_outbox(
  p_outbox_id UUID,
  p_lease_token UUID,
  p_bullmq_job_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated UUID;
BEGIN
  UPDATE private.generation_job_outbox AS o
  SET status = 'published',
      lease_token = NULL,
      lease_expires_at = NULL,
      bullmq_job_id = p_bullmq_job_id,
      published_at = clock_timestamp(),
      updated_at = clock_timestamp(),
      last_error = NULL
  WHERE o.id = p_outbox_id
    AND o.status = 'publishing'
    AND o.lease_token = p_lease_token
    AND p_bullmq_job_id = o.delivery_key
  RETURNING o.id INTO v_updated;

  RETURN v_updated IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.nack_generation_outbox(
  p_outbox_id UUID,
  p_lease_token UUID,
  p_error TEXT,
  p_delay_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_updated UUID;
BEGIN
  IF p_delay_seconds NOT BETWEEN 1 AND 3600 THEN
    RAISE EXCEPTION 'INVALID_OUTBOX_RETRY_DELAY' USING ERRCODE = '22023';
  END IF;

  UPDATE private.generation_job_outbox AS o
  SET status = CASE WHEN o.attempts >= o.max_attempts THEN 'dead' ELSE 'pending' END,
      available_at = v_now + make_interval(secs => p_delay_seconds),
      lease_token = NULL,
      lease_expires_at = NULL,
      published_at = NULL,
      bullmq_job_id = NULL,
      last_error = left(COALESCE(NULLIF(btrim(p_error), ''), 'BullMQ publish failed'), 1000),
      updated_at = v_now
  WHERE o.id = p_outbox_id
    AND o.status = 'publishing'
    AND o.lease_token = p_lease_token
  RETURNING o.id INTO v_updated;

  RETURN v_updated IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.recover_generation_outbox(
  p_limit INTEGER DEFAULT 500,
  p_max_execution_attempts INTEGER DEFAULT 10
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
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_recovered INTEGER := 0;
  v_repaired INTEGER := 0;
  v_dead INTEGER := 0;
  v_redriven INTEGER := 0;
  v_cleaned INTEGER := 0;
  v_recovered_executions INTEGER := 0;
  v_failed_executions INTEGER := 0;
  v_refunded_credits BIGINT := 0;
  v_refund_amount INTEGER;
  v_balance INTEGER;
  v_next_delivery_version INTEGER;
  v_generation public.generations%ROWTYPE;
  v_execution_error TEXT;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION 'INVALID_OUTBOX_RECOVERY_LIMIT' USING ERRCODE = '22023';
  END IF;
  IF p_max_execution_attempts IS NULL OR p_max_execution_attempts NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'INVALID_MAX_EXECUTION_ATTEMPTS' USING ERRCODE = '22023';
  END IF;

  -- A Bull retry can race this reconciler. Locking the generation row makes the
  -- outcome deterministic: either the retry renews the execution lease first,
  -- or recovery advances delivery_version first and permanently fences the old
  -- Bull delivery/token. Capacity deferrals do not consume job_attempts, so this
  -- execution ceiling is independent from publisher and provider-capacity retry
  -- budgets.
  FOR v_generation IN
    SELECT g.*
    FROM public.generations AS g
    WHERE g.status = 'processing_tryon'
      AND g.execution_lease_expires_at <= v_now
    ORDER BY g.execution_lease_expires_at, g.created_at, g.id
    LIMIT p_limit
    FOR UPDATE OF g SKIP LOCKED
  LOOP
    IF COALESCE(v_generation.job_attempts, 0) < p_max_execution_attempts THEN
      v_next_delivery_version := v_generation.delivery_version + 1;
      v_execution_error := format(
        'recovery: execution lease expired; scheduled execution attempt %s of %s',
        COALESCE(v_generation.job_attempts, 0) + 1,
        p_max_execution_attempts
      );

      UPDATE public.generations AS g
      SET status = 'queued',
          processing_started_at = NULL,
          delivery_version = v_next_delivery_version,
          available_at = v_now,
          execution_token = NULL,
          execution_lease_expires_at = NULL,
          error_message = left(v_execution_error, 1000),
          completed_at = NULL
      WHERE g.id = v_generation.id
        AND g.status = 'processing_tryon'
        AND g.delivery_version = v_generation.delivery_version
        AND g.execution_token = v_generation.execution_token
        AND g.execution_lease_expires_at <= v_now;

      IF FOUND THEN
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
          v_next_delivery_version,
          'generation-' || v_generation.id::TEXT || '-v' || v_next_delivery_version::TEXT,
          COALESCE(
            v_generation.request_idempotency_key,
            'internal-generation-' || v_generation.id::TEXT
          ),
          jsonb_build_object(
            'schemaVersion', 1,
            'generationId', v_generation.id,
            'deliveryVersion', v_next_delivery_version
          ),
          v_now,
          v_execution_error
        )
        ON CONFLICT (generation_id, delivery_version) DO NOTHING;
        v_recovered_executions := v_recovered_executions + 1;
      END IF;
    ELSE
      v_execution_error := format(
        'recovery: maximum execution attempts exhausted (%s); credits refunded',
        p_max_execution_attempts
      );
      v_refund_amount := GREATEST(
        COALESCE(v_generation.credits_used, v_generation.credits_cost, 0),
        0
      );

      -- The locked processing -> failed transition is the settlement
      -- idempotency key. Once committed, neither this reconciler nor a stale
      -- worker can match the old status/version/token fence and refund again.
      UPDATE public.generations AS g
      SET status = 'failed',
          error_message = left(v_execution_error, 1000),
          processing_started_at = NULL,
          execution_token = NULL,
          execution_lease_expires_at = NULL,
          completed_at = COALESCE(g.completed_at, v_now),
          credits_used = 0
      WHERE g.id = v_generation.id
        AND g.status = 'processing_tryon'
        AND g.delivery_version = v_generation.delivery_version
        AND g.execution_token = v_generation.execution_token
        AND g.execution_lease_expires_at <= v_now;

      IF FOUND THEN
        IF v_refund_amount > 0 THEN
          v_balance := NULL;
          UPDATE public.profiles AS p
          SET credits = p.credits + v_refund_amount,
              total_credits_used = GREATEST(
                COALESCE(p.total_credits_used, 0) - v_refund_amount,
                0
              ),
              updated_at = v_now
          WHERE p.id = v_generation.user_id
          RETURNING p.credits INTO v_balance;

          IF v_balance IS NOT NULL THEN
            INSERT INTO public.credit_logs (
              user_id,
              amount,
              balance,
              reason,
              generation_id
            )
            VALUES (
              v_generation.user_id,
              v_refund_amount,
              v_balance,
              '生成执行重试耗尽退款',
              v_generation.id
            );
            v_refunded_credits := v_refunded_credits + v_refund_amount;
          ELSE
            UPDATE public.generations AS g
            SET error_message = left(
              v_execution_error || '; profile missing, no refundable balance remains',
              1000
            )
            WHERE g.id = v_generation.id;
          END IF;
        END IF;

        -- Preserve a durable DLQ record even if the original transactional
        -- outbox row was lost. Existing published/publishing state is cleared
        -- so the outbox state constraints remain valid.
        INSERT INTO private.generation_job_outbox (
          generation_id,
          user_id,
          delivery_version,
          delivery_key,
          idempotency_key,
          payload,
          status,
          available_at,
          last_error,
          updated_at
        )
        VALUES (
          v_generation.id,
          v_generation.user_id,
          v_generation.delivery_version,
          'generation-' || v_generation.id::TEXT || '-v' || v_generation.delivery_version::TEXT,
          COALESCE(
            v_generation.request_idempotency_key,
            'internal-generation-' || v_generation.id::TEXT
          ),
          jsonb_build_object(
            'schemaVersion', 1,
            'generationId', v_generation.id,
            'deliveryVersion', v_generation.delivery_version
          ),
          'dead',
          v_now,
          v_execution_error,
          v_now
        )
        ON CONFLICT (generation_id, delivery_version) DO UPDATE
        SET status = 'dead',
            lease_token = NULL,
            lease_expires_at = NULL,
            published_at = NULL,
            last_error = EXCLUDED.last_error,
            updated_at = EXCLUDED.updated_at;

        v_failed_executions := v_failed_executions + 1;
      END IF;
    END IF;
  END LOOP;

  WITH exhausted AS (
    SELECT o.id
    FROM private.generation_job_outbox AS o
    WHERE o.attempts >= o.max_attempts
      AND (
        o.status = 'pending'
        OR (o.status = 'publishing' AND o.lease_expires_at <= v_now)
      )
    ORDER BY o.created_at, o.id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE private.generation_job_outbox AS o
  SET status = 'dead',
      lease_token = NULL,
      lease_expires_at = NULL,
      published_at = NULL,
      bullmq_job_id = NULL,
      last_error = COALESCE(o.last_error, 'outbox publish attempts exhausted'),
      updated_at = v_now
  FROM exhausted
  WHERE o.id = exhausted.id;
  GET DIAGNOSTICS v_dead = ROW_COUNT;

  WITH expired AS (
    SELECT o.id
    FROM private.generation_job_outbox AS o
    WHERE o.status = 'publishing'
      AND o.attempts < o.max_attempts
      AND o.lease_expires_at <= v_now
    ORDER BY o.lease_expires_at, o.id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE private.generation_job_outbox AS o
  SET status = 'pending',
      available_at = LEAST(o.available_at, v_now),
      lease_token = NULL,
      lease_expires_at = NULL,
      updated_at = v_now,
      last_error = COALESCE(o.last_error, 'publisher lease expired before confirmation')
  FROM expired
  WHERE o.id = expired.id;
  GET DIAGNOSTICS v_recovered = ROW_COUNT;

  -- A successful publish acknowledgement is not proof that Redis retained the
  -- job forever. Re-arm the same deterministic delivery after a conservative
  -- quiet period when Postgres still says it is the current, ready, queued
  -- delivery. If Redis still has the job, Queue.add(jobId) deduplicates it and
  -- confirm simply refreshes published_at; if Redis was flushed, it is restored.
  WITH published_redrive AS (
    SELECT o.id
    FROM private.generation_job_outbox AS o
    JOIN public.generations AS g ON g.id = o.generation_id
    WHERE o.status = 'published'
      AND o.published_at <= v_now - interval '120 seconds'
      AND o.available_at <= v_now
      AND g.status = 'queued'
      AND g.delivery_version = o.delivery_version
      AND g.available_at <= v_now
    ORDER BY o.published_at, o.id
    LIMIT p_limit
    FOR UPDATE OF g, o SKIP LOCKED
  )
  UPDATE private.generation_job_outbox AS o
  SET status = 'pending',
      attempts = 0,
      lease_token = NULL,
      lease_expires_at = NULL,
      bullmq_job_id = NULL,
      published_at = NULL,
      updated_at = v_now,
      last_error = 'published delivery scheduled for fenced Redis redrive'
  FROM published_redrive
  WHERE o.id = published_redrive.id;
  GET DIAGNOSTICS v_redriven = ROW_COUNT;

  -- This repairs post-migration invariant drift only. Historical rows were
  -- deliberately deleted above and are never imported into BullMQ.
  WITH missing AS (
    SELECT g.id
    FROM public.generations AS g
    WHERE g.status = 'queued'
      AND g.delivery_version >= 1
      AND NOT EXISTS (
        SELECT 1
        FROM private.generation_job_outbox AS o
        WHERE o.generation_id = g.id
          AND o.delivery_version = g.delivery_version
      )
    ORDER BY g.available_at, g.created_at, g.id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ),
  inserted AS (
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
    SELECT
      g.id,
      g.user_id,
      g.delivery_version,
      'generation-' || g.id::TEXT || '-v' || g.delivery_version::TEXT,
      g.request_idempotency_key,
      jsonb_build_object(
        'schemaVersion', 1,
        'generationId', g.id,
        'deliveryVersion', g.delivery_version
      ),
      g.available_at,
      'repaired missing transactional outbox delivery'
    FROM missing
    JOIN public.generations AS g ON g.id = missing.id
    WHERE g.request_idempotency_key IS NOT NULL
    ON CONFLICT (generation_id, delivery_version) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::INTEGER INTO v_repaired FROM inserted;

  -- Retention is deliberately generation-state aware. Never delete a dead
  -- delivery for queued/processing work: those rows are the operator-visible
  -- DLQ and may be the only evidence needed for manual recovery.
  WITH retention_candidates AS (
    SELECT o.id
    FROM private.generation_job_outbox AS o
    JOIN public.generations AS g ON g.id = o.generation_id
    WHERE g.status IN ('completed', 'failed')
      AND (
        (o.status = 'published' AND o.published_at <= v_now - interval '7 days')
        OR (o.status = 'dead' AND o.updated_at <= v_now - interval '30 days')
      )
    ORDER BY
      CASE WHEN o.status = 'published' THEN o.published_at ELSE o.updated_at END,
      o.id
    LIMIT p_limit
    FOR UPDATE OF o SKIP LOCKED
  )
  DELETE FROM private.generation_job_outbox AS o
  USING retention_candidates
  WHERE o.id = retention_candidates.id;
  GET DIAGNOSTICS v_cleaned = ROW_COUNT;

  RETURN QUERY SELECT
    v_recovered,
    v_repaired,
    v_dead,
    v_redriven,
    v_cleaned,
    v_recovered_executions,
    v_failed_executions,
    v_refunded_credits;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_generation_queue_health()
RETURNS TABLE(
  pending_count BIGINT,
  publishing_count BIGINT,
  published_count BIGINT,
  dead_count BIGINT,
  oldest_pending_age_seconds BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    count(*) FILTER (WHERE o.status = 'pending') AS pending_count,
    count(*) FILTER (WHERE o.status = 'publishing') AS publishing_count,
    count(*) FILTER (WHERE o.status = 'published') AS published_count,
    count(*) FILTER (WHERE o.status = 'dead') AS dead_count,
    COALESCE(
      FLOOR(EXTRACT(EPOCH FROM (now() - min(o.available_at) FILTER (
        WHERE o.status = 'pending'
      ))))::BIGINT,
      0
    ) AS oldest_pending_age_seconds
  FROM private.generation_job_outbox AS o;
$$;

CREATE OR REPLACE FUNCTION public.redrive_generation_outbox(
  p_outbox_id UUID,
  p_redrive_id UUID,
  p_reason TEXT
)
RETURNS TABLE(
  redrive_id UUID,
  outbox_id UUID,
  generation_id UUID,
  delivery_version INTEGER,
  status TEXT,
  attempts INTEGER,
  available_at TIMESTAMPTZ,
  replayed BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_reason TEXT := btrim(COALESCE(p_reason, ''));
  v_outbox private.generation_job_outbox%ROWTYPE;
  v_audit private.generation_outbox_redrive_audit%ROWTYPE;
BEGIN
  IF COALESCE((SELECT auth.role()), '') <> 'service_role' THEN
    RAISE EXCEPTION 'GENERATION_OUTBOX_SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_outbox_id IS NULL OR p_redrive_id IS NULL
     OR char_length(v_reason) NOT BETWEEN 8 AND 1000 THEN
    RAISE EXCEPTION 'INVALID_GENERATION_OUTBOX_REDRIVE' USING ERRCODE = '22023';
  END IF;

  -- The client-supplied redrive id is the audit/idempotency key. Serialize the
  -- first mutation and any ambiguous-response retry without exposing the audit
  -- table through the Data API.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_redrive_id::TEXT, 0));
  SELECT audit.*
  INTO v_audit
  FROM private.generation_outbox_redrive_audit AS audit
  WHERE audit.redrive_id = p_redrive_id;

  IF FOUND THEN
    IF v_audit.outbox_id <> p_outbox_id OR v_audit.reason <> v_reason THEN
      RAISE EXCEPTION 'GENERATION_OUTBOX_REDRIVE_IDEMPOTENCY_CONFLICT'
        USING ERRCODE = '23505';
    END IF;
    RETURN QUERY SELECT
      v_audit.redrive_id,
      v_audit.outbox_id,
      v_audit.generation_id,
      v_audit.delivery_version,
      'pending'::TEXT,
      0,
      v_audit.available_at,
      true;
    RETURN;
  END IF;

  SELECT o.*
  INTO v_outbox
  FROM private.generation_job_outbox AS o
  JOIN public.generations AS g ON g.id = o.generation_id
  WHERE o.id = p_outbox_id
    AND o.status = 'dead'
    AND g.status = 'queued'
    AND g.delivery_version = o.delivery_version
  FOR UPDATE OF o, g;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'GENERATION_OUTBOX_NOT_CURRENT_DEAD_DELIVERY'
      USING ERRCODE = '40001';
  END IF;

  UPDATE private.generation_job_outbox AS o
  SET status = 'pending',
      attempts = 0,
      available_at = v_now,
      lease_token = NULL,
      lease_expires_at = NULL,
      bullmq_job_id = NULL,
      published_at = NULL,
      last_error = left('admin redrive: ' || v_reason, 1000),
      updated_at = v_now
  WHERE o.id = v_outbox.id
    AND o.status = 'dead';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'GENERATION_OUTBOX_REDRIVE_LOST_FENCE' USING ERRCODE = '40001';
  END IF;

  INSERT INTO private.generation_outbox_redrive_audit (
    redrive_id,
    outbox_id,
    generation_id,
    user_id,
    delivery_version,
    previous_attempts,
    reason,
    requested_by,
    available_at
  )
  VALUES (
    p_redrive_id,
    v_outbox.id,
    v_outbox.generation_id,
    v_outbox.user_id,
    v_outbox.delivery_version,
    v_outbox.attempts,
    v_reason,
    auth.uid(),
    v_now
  )
  RETURNING * INTO v_audit;

  RETURN QUERY SELECT
    v_audit.redrive_id,
    v_audit.outbox_id,
    v_audit.generation_id,
    v_audit.delivery_version,
    'pending'::TEXT,
    0,
    v_audit.available_at,
    false;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_generation_job(
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
  job_attempts INTEGER
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
  UPDATE public.generations AS g
  SET status = 'processing_tryon',
      processing_started_at = v_now,
      execution_token = p_execution_token,
      execution_lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
      job_attempts = COALESCE(g.job_attempts, 0) + 1,
      error_message = NULL
  WHERE g.id = p_generation_id
    AND g.delivery_version = p_delivery_version
    AND g.available_at <= v_now
    AND (
      g.status = 'queued'
      OR (
        g.status = 'processing_tryon'
        AND g.execution_lease_expires_at <= v_now
      )
    )
  RETURNING g.id, g.user_id, g.job_payload, g.credits_cost, g.job_attempts;
END;
$$;

CREATE OR REPLACE FUNCTION public.heartbeat_generation_job(
  p_generation_id UUID,
  p_delivery_version INTEGER,
  p_execution_token UUID,
  p_lease_seconds INTEGER DEFAULT 45
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated UUID;
BEGIN
  IF p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 15 AND 300 THEN
    RAISE EXCEPTION 'INVALID_GENERATION_LEASE' USING ERRCODE = '22023';
  END IF;

  UPDATE public.generations AS g
  SET processing_started_at = clock_timestamp(),
      execution_lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds)
  WHERE g.id = p_generation_id
    AND g.status = 'processing_tryon'
    AND g.delivery_version = p_delivery_version
    AND g.execution_token = p_execution_token
  RETURNING g.id INTO v_updated;

  RETURN v_updated IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.defer_generation_for_ai_capacity(
  p_generation_id UUID,
  p_user_id UUID,
  p_delivery_version INTEGER,
  p_execution_token UUID,
  p_delay_seconds INTEGER DEFAULT 15,
  p_reason TEXT DEFAULT 'AI provider capacity is temporarily unavailable'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_generation public.generations%ROWTYPE;
BEGIN
  IF p_delay_seconds NOT BETWEEN 5 AND 3600 THEN
    RAISE EXCEPTION 'INVALID_CAPACITY_DELAY' USING ERRCODE = '22023';
  END IF;

  UPDATE public.generations AS g
  SET status = 'queued',
      processing_started_at = NULL,
      delivery_version = g.delivery_version + 1,
      available_at = v_now + make_interval(secs => p_delay_seconds),
      execution_token = NULL,
      execution_lease_expires_at = NULL,
      job_attempts = GREATEST(COALESCE(g.job_attempts, 0) - 1, 0),
      error_message = left(
        COALESCE(NULLIF(btrim(p_reason), ''), 'AI provider capacity is temporarily unavailable'),
        500
      ),
      completed_at = NULL
  WHERE g.id = p_generation_id
    AND g.user_id = p_user_id
    AND g.status = 'processing_tryon'
    AND g.delivery_version = p_delivery_version
    AND g.execution_token = p_execution_token
  RETURNING g.* INTO v_generation;

  IF v_generation.id IS NULL THEN
    RETURN FALSE;
  END IF;

  INSERT INTO private.generation_job_outbox (
    generation_id,
    user_id,
    delivery_version,
    delivery_key,
    idempotency_key,
    payload,
    available_at
  )
  VALUES (
    v_generation.id,
    v_generation.user_id,
    v_generation.delivery_version,
    'generation-' || v_generation.id::TEXT || '-v' || v_generation.delivery_version::TEXT,
    v_generation.request_idempotency_key,
    jsonb_build_object(
      'schemaVersion', 1,
      'generationId', v_generation.id,
      'deliveryVersion', v_generation.delivery_version
    ),
    v_generation.available_at
  );

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_generation_with_credit_refund(
  p_user_id UUID,
  p_generation_id UUID,
  p_amount INTEGER,
  p_delivery_version INTEGER,
  p_execution_token UUID,
  p_reason TEXT DEFAULT '生成失败退款',
  p_error_message TEXT DEFAULT '生成失败'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_balance INTEGER;
  v_refund_amount INTEGER;
  v_generation_id UUID;
BEGIN
  SELECT LEAST(
    GREATEST(p_amount, 0),
    GREATEST(COALESCE(g.credits_used, g.credits_cost, 0), 0)
  )
  INTO v_refund_amount
  FROM public.generations AS g
  WHERE g.id = p_generation_id
    AND g.user_id = p_user_id
    AND g.status = 'processing_tryon'
    AND g.delivery_version = p_delivery_version
    AND g.execution_token = p_execution_token
  FOR UPDATE;

  SELECT p.credits INTO v_balance
  FROM public.profiles AS p
  WHERE p.id = p_user_id;

  IF v_refund_amount IS NULL THEN
    RAISE EXCEPTION 'STALE_EXECUTION_FENCE' USING ERRCODE = '40001';
  END IF;

  UPDATE public.generations AS g
  SET status = 'failed',
      error_message = left(COALESCE(p_error_message, '生成失败'), 1000),
      processing_started_at = NULL,
      execution_token = NULL,
      execution_lease_expires_at = NULL,
      completed_at = COALESCE(g.completed_at, clock_timestamp()),
      credits_used = 0
  WHERE g.id = p_generation_id
    AND g.user_id = p_user_id
    AND g.status = 'processing_tryon'
    AND g.delivery_version = p_delivery_version
    AND g.execution_token = p_execution_token
  RETURNING g.id INTO v_generation_id;

  IF v_generation_id IS NULL OR v_refund_amount <= 0 THEN
    RETURN COALESCE(v_balance, 0);
  END IF;

  UPDATE public.profiles AS p
  SET credits = p.credits + v_refund_amount,
      total_credits_used = GREATEST(COALESCE(p.total_credits_used, 0) - v_refund_amount, 0),
      updated_at = clock_timestamp()
  WHERE p.id = p_user_id
  RETURNING p.credits INTO v_balance;

  INSERT INTO public.credit_logs (user_id, amount, balance, reason, generation_id)
  VALUES (p_user_id, v_refund_amount, v_balance, p_reason, p_generation_id);

  RETURN COALESCE(v_balance, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_generation_with_credit_adjustment(
  p_user_id UUID,
  p_generation_id UUID,
  p_result_urls TEXT[],
  p_delivery_version INTEGER,
  p_execution_token UUID,
  p_job_payload JSONB DEFAULT '{}'::jsonb,
  p_credits_used INTEGER DEFAULT 0,
  p_refund_amount INTEGER DEFAULT 0,
  p_refund_reason TEXT DEFAULT '部分生成失败退款',
  p_error_message TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_balance INTEGER;
  v_existing_used INTEGER;
  v_safe_used INTEGER;
  v_safe_refund INTEGER;
BEGIN
  SELECT COALESCE(g.credits_used, g.credits_cost, 0)
  INTO v_existing_used
  FROM public.generations AS g
  WHERE g.id = p_generation_id
    AND g.user_id = p_user_id
    AND g.status = 'processing_tryon'
    AND g.delivery_version = p_delivery_version
    AND g.execution_token = p_execution_token
  FOR UPDATE;

  SELECT p.credits INTO v_balance
  FROM public.profiles AS p
  WHERE p.id = p_user_id;

  IF v_existing_used IS NULL THEN
    RAISE EXCEPTION 'STALE_EXECUTION_FENCE' USING ERRCODE = '40001';
  END IF;

  v_safe_used := LEAST(GREATEST(COALESCE(p_credits_used, 0), 0), GREATEST(v_existing_used, 0));
  v_safe_refund := LEAST(
    GREATEST(COALESCE(p_refund_amount, 0), 0),
    GREATEST(v_existing_used - v_safe_used, 0)
  );

  UPDATE public.generations AS g
  SET status = 'completed',
      result_urls = COALESCE(p_result_urls, ARRAY[]::TEXT[]),
      job_payload = COALESCE(p_job_payload, '{}'::jsonb),
      error_message = CASE
        WHEN p_error_message IS NULL OR btrim(p_error_message) = '' THEN g.error_message
        ELSE left(p_error_message, 1000)
      END,
      credits_used = v_safe_used,
      processing_started_at = NULL,
      execution_token = NULL,
      execution_lease_expires_at = NULL,
      completed_at = COALESCE(g.completed_at, clock_timestamp())
  WHERE g.id = p_generation_id
    AND g.user_id = p_user_id
    AND g.status = 'processing_tryon'
    AND g.delivery_version = p_delivery_version
    AND g.execution_token = p_execution_token;

  IF v_safe_refund > 0 THEN
    UPDATE public.profiles AS p
    SET credits = p.credits + v_safe_refund,
        total_credits_used = GREATEST(COALESCE(p.total_credits_used, 0) - v_safe_refund, 0),
        updated_at = clock_timestamp()
    WHERE p.id = p_user_id
    RETURNING p.credits INTO v_balance;

    INSERT INTO public.credit_logs (user_id, amount, balance, reason, generation_id)
    VALUES (p_user_id, v_safe_refund, v_balance, p_refund_reason, p_generation_id);
  END IF;

  RETURN COALESCE(v_balance, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.create_generation_with_credit_debit_v2(
  UUID, TEXT[], TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, JSONB, TEXT, INTEGER
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_generation_with_credit_debit_v2(
  UUID, TEXT[], TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, JSONB, TEXT, INTEGER
) TO authenticated;

REVOKE ALL ON FUNCTION public.claim_generation_outbox(INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_generation_outbox(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.nack_generation_outbox(UUID, UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recover_generation_outbox(INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.redrive_generation_outbox(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_generation_queue_health() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_generation_job(UUID, INTEGER, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.heartbeat_generation_job(UUID, INTEGER, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.defer_generation_for_ai_capacity(UUID, UUID, INTEGER, UUID, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_generation_with_credit_refund(UUID, UUID, INTEGER, INTEGER, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_generation_with_credit_adjustment(UUID, UUID, TEXT[], INTEGER, UUID, JSONB, INTEGER, INTEGER, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_generation_outbox(INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_generation_outbox(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.nack_generation_outbox(UUID, UUID, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.recover_generation_outbox(INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.redrive_generation_outbox(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_generation_queue_health() TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_generation_job(UUID, INTEGER, UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.heartbeat_generation_job(UUID, INTEGER, UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.defer_generation_for_ai_capacity(UUID, UUID, INTEGER, UUID, INTEGER, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_generation_with_credit_refund(UUID, UUID, INTEGER, INTEGER, UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_generation_with_credit_adjustment(UUID, UUID, TEXT[], INTEGER, UUID, JSONB, INTEGER, INTEGER, TEXT, TEXT) TO service_role;

COMMENT ON TABLE private.generation_job_outbox IS
  'Transactional at-least-once delivery log for BullMQ generation jobs.';
COMMENT ON COLUMN public.generations.delivery_version IS
  'Monotonic generation delivery fence; capacity deferral creates the next version atomically.';
COMMENT ON COLUMN public.generations.execution_token IS
  'Per-claim fencing token required by heartbeat, defer, completion, and refund settlement RPCs.';
