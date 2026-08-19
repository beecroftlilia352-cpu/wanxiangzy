-- A recovered execution can finish after its delivery fence has moved on.
-- Terminal settlement for that old worker is already a no-op by definition;
-- returning the current balance avoids turning an expected race into a noisy
-- 40001 error that BullMQ retries.

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
    RETURN COALESCE(v_balance, 0);
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
    RETURN COALESCE(v_balance, 0);
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

COMMENT ON FUNCTION public.fail_generation_with_credit_refund(
  UUID, UUID, INTEGER, INTEGER, UUID, TEXT, TEXT
) IS 'Fenced failure settlement; stale executions are idempotent no-ops.';

COMMENT ON FUNCTION public.complete_generation_with_credit_adjustment(
  UUID, UUID, TEXT[], INTEGER, UUID, JSONB, INTEGER, INTEGER, TEXT, TEXT
) IS 'Fenced completion settlement; stale executions are idempotent no-ops.';
