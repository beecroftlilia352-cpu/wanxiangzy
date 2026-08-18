-- Empty strings are in-memory ordering placeholders, not generated outputs.
-- Never let them suppress a failure refund if a worker fails before storage.
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
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_generation_with_credit_refund(
  UUID, UUID, INTEGER, TEXT, TEXT
) TO service_role;
