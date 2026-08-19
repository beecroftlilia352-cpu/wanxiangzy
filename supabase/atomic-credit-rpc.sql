-- ============================================================
-- Atomic credit debit/refund RPCs
-- Run this after schema.sql and credits-update.sql.
-- ============================================================

ALTER TABLE public.generations
  ADD COLUMN IF NOT EXISTS job_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS job_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS generations_job_queue_idx
  ON public.generations (status, created_at)
  WHERE status IN ('queued', 'processing_tryon');

CREATE INDEX IF NOT EXISTS generations_job_ready_idx
  ON public.generations (status, next_attempt_at, created_at)
  WHERE status IN ('queued', 'processing_tryon');

CREATE OR REPLACE FUNCTION public.create_generation_with_credit_debit(
  p_user_id UUID,
  p_clothing_urls TEXT[],
  p_model_face_url TEXT DEFAULT NULL,
  p_reference_url TEXT DEFAULT NULL,
  p_credits_cost INTEGER DEFAULT 1,
  p_ai_model TEXT DEFAULT 'gpt-image-2',
  p_image_size TEXT DEFAULT '1K',
  p_reason TEXT DEFAULT '生成',
  p_job_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE(generation_id UUID, credits_remaining INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance INTEGER;
  v_generation_id UUID;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  IF p_credits_cost <= 0 THEN
    RAISE EXCEPTION 'INVALID_CREDIT_AMOUNT' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
    SET
      credits = credits - p_credits_cost,
      total_credits_used = COALESCE(total_credits_used, 0) + p_credits_cost,
      updated_at = now()
    WHERE id = p_user_id
      AND credits >= p_credits_cost
    RETURNING credits INTO v_balance;

  IF v_balance IS NULL THEN
    SELECT credits INTO v_balance
    FROM public.profiles
    WHERE id = p_user_id;

    RAISE EXCEPTION 'INSUFFICIENT_CREDITS:%', COALESCE(v_balance, 0)
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
    job_payload
  )
  VALUES (
    p_user_id,
    COALESCE(p_clothing_urls, '{}'),
    p_model_face_url,
    p_reference_url,
    'queued',
    p_credits_cost,
    p_credits_cost,
    p_ai_model,
    p_image_size,
    COALESCE(p_job_payload, '{}'::jsonb)
  )
  RETURNING id INTO v_generation_id;

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
    p_reason,
    v_generation_id
  );

  RETURN QUERY SELECT v_generation_id, v_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.create_generation_with_credit_debit(
  UUID, TEXT[], TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_generation_with_credit_debit(
  UUID, TEXT[], TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, JSONB
) TO authenticated;

CREATE OR REPLACE FUNCTION public.fail_generation_with_credit_refund(
  p_user_id UUID,
  p_generation_id UUID,
  p_amount INTEGER,
  p_reason TEXT DEFAULT '生成失败退款',
  p_error_message TEXT DEFAULT '生成失败'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance INTEGER;
  v_generation_id UUID;
  v_refund_amount INTEGER;
BEGIN
  SELECT credits INTO v_balance
  FROM public.profiles
  WHERE id = p_user_id;

  IF p_amount <= 0 THEN
    RETURN COALESCE(v_balance, 0);
  END IF;

  UPDATE public.generations
    SET
      status = 'completed',
      processing_started_at = NULL,
      completed_at = COALESCE(completed_at, now())
    WHERE id = p_generation_id
      AND user_id = p_user_id
      AND status NOT IN ('completed', 'success', 'succeeded')
      AND EXISTS (
        SELECT 1
        FROM unnest(COALESCE(result_urls, '{}'::TEXT[])) AS result_url
        WHERE NULLIF(btrim(result_url), '') IS NOT NULL
      );

  SELECT LEAST(GREATEST(p_amount, 0), GREATEST(COALESCE(credits_used, credits_cost, 0), 0))
    INTO v_refund_amount
  FROM public.generations
  WHERE id = p_generation_id
    AND user_id = p_user_id
    AND status NOT IN ('failed', 'completed', 'success', 'succeeded')
    AND COALESCE(credits_used, credits_cost, 0) > 0
  FOR UPDATE;

  IF v_refund_amount IS NULL OR v_refund_amount <= 0 THEN
    SELECT credits INTO v_balance
    FROM public.profiles
    WHERE id = p_user_id;

    RETURN COALESCE(v_balance, 0);
  END IF;

  UPDATE public.generations
    SET
      status = 'failed',
      error_message = p_error_message,
      processing_started_at = NULL,
      completed_at = COALESCE(completed_at, now()),
      credits_used = 0
    WHERE id = p_generation_id
      AND user_id = p_user_id
      AND status NOT IN ('failed', 'completed', 'success', 'succeeded')
    RETURNING id INTO v_generation_id;

  IF v_generation_id IS NULL THEN
    SELECT credits INTO v_balance
    FROM public.profiles
    WHERE id = p_user_id;

    RETURN COALESCE(v_balance, 0);
  END IF;

  UPDATE public.profiles
    SET credits = credits + v_refund_amount,
        total_credits_used = GREATEST(COALESCE(total_credits_used, 0) - v_refund_amount, 0),
        updated_at = now()
    WHERE id = p_user_id
    RETURNING credits INTO v_balance;

  INSERT INTO public.credit_logs (
    user_id,
    amount,
    balance,
    reason,
    generation_id
  )
  VALUES (
    p_user_id,
    v_refund_amount,
    v_balance,
    p_reason,
    p_generation_id
  );

  RETURN v_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.fail_generation_with_credit_refund(
  UUID, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fail_generation_with_credit_refund(
  UUID, UUID, INTEGER, TEXT, TEXT
) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_generation_with_credit_adjustment(
  p_user_id UUID,
  p_generation_id UUID,
  p_result_urls TEXT[],
  p_job_payload JSONB DEFAULT '{}'::jsonb,
  p_credits_used INTEGER DEFAULT 0,
  p_refund_amount INTEGER DEFAULT 0,
  p_refund_reason TEXT DEFAULT '部分生成失败退款',
  p_error_message TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance INTEGER;
  v_existing_used INTEGER;
  v_safe_used INTEGER;
  v_safe_refund INTEGER;
BEGIN
  SELECT COALESCE(credits_used, credits_cost, 0)
    INTO v_existing_used
  FROM public.generations
  WHERE id = p_generation_id
    AND user_id = p_user_id
  FOR UPDATE;

  SELECT credits INTO v_balance
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_existing_used IS NULL THEN
    RETURN COALESCE(v_balance, 0);
  END IF;

  v_safe_used := LEAST(GREATEST(COALESCE(p_credits_used, 0), 0), GREATEST(v_existing_used, 0));
  v_safe_refund := LEAST(
    GREATEST(COALESCE(p_refund_amount, 0), 0),
    GREATEST(v_existing_used - v_safe_used, 0)
  );

  UPDATE public.generations
    SET
      status = 'completed',
      result_urls = COALESCE(p_result_urls, '{}'),
      job_payload = COALESCE(p_job_payload, '{}'::jsonb),
      error_message = CASE
        WHEN p_error_message IS NULL OR length(trim(p_error_message)) = 0 THEN error_message
        ELSE p_error_message
      END,
      credits_used = v_safe_used,
      processing_started_at = NULL,
      completed_at = COALESCE(completed_at, now())
    WHERE id = p_generation_id
      AND user_id = p_user_id;

  IF v_safe_refund > 0 THEN
    UPDATE public.profiles
      SET credits = credits + v_safe_refund,
          total_credits_used = GREATEST(COALESCE(total_credits_used, 0) - v_safe_refund, 0),
          updated_at = now()
      WHERE id = p_user_id
      RETURNING credits INTO v_balance;

    INSERT INTO public.credit_logs (
      user_id,
      amount,
      balance,
      reason,
      generation_id
    )
    VALUES (
      p_user_id,
      v_safe_refund,
      v_balance,
      p_refund_reason,
      p_generation_id
    );
  END IF;

  RETURN COALESCE(v_balance, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.complete_generation_with_credit_adjustment(
  UUID, UUID, TEXT[], JSONB, INTEGER, INTEGER, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_generation_with_credit_adjustment(
  UUID, UUID, TEXT[], JSONB, INTEGER, INTEGER, TEXT, TEXT
) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_generation_job(
  p_generation_id UUID,
  p_stale_after INTERVAL DEFAULT '8 minutes'
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
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.generations g
    SET
      status = 'processing_tryon',
      processing_started_at = now(),
      next_attempt_at = NULL,
      job_attempts = COALESCE(g.job_attempts, 0) + 1,
      error_message = NULL
    WHERE g.id = p_generation_id
      AND COALESCE(g.job_attempts, 0) < 3
      AND (g.next_attempt_at IS NULL OR g.next_attempt_at <= now())
      AND (
        g.status = 'queued'
        OR (
          g.status = 'processing_tryon'
          AND (
            g.processing_started_at IS NULL
            OR g.processing_started_at < now() - p_stale_after
          )
        )
      )
    RETURNING g.id, g.user_id, g.job_payload, g.credits_cost, g.job_attempts;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_generation_job(UUID, INTERVAL) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_generation_job(UUID, INTERVAL) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_next_generation_jobs(
  p_limit INTEGER DEFAULT 2,
  p_stale_after INTERVAL DEFAULT '8 minutes'
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
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT g.id
    FROM public.generations g
    WHERE COALESCE(g.job_attempts, 0) < 3
      AND (g.next_attempt_at IS NULL OR g.next_attempt_at <= now())
      AND (
        g.status = 'queued'
        OR (
          g.status = 'processing_tryon'
          AND (
            g.processing_started_at IS NULL
            OR g.processing_started_at < now() - p_stale_after
          )
        )
      )
    ORDER BY g.created_at ASC
    LIMIT LEAST(GREATEST(p_limit, 1), 10)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.generations g
    SET
      status = 'processing_tryon',
      processing_started_at = now(),
      next_attempt_at = NULL,
      job_attempts = COALESCE(g.job_attempts, 0) + 1,
      error_message = NULL
    FROM candidates
    WHERE g.id = candidates.id
    RETURNING g.id, g.user_id, g.job_payload, g.credits_cost, g.job_attempts;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_next_generation_jobs(INTEGER, INTERVAL) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_next_generation_jobs(INTEGER, INTERVAL) TO service_role;
