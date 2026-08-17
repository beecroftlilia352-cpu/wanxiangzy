-- AI routing queue backpressure.
-- Run after atomic-credit-rpc.sql. This migration is safe to apply to an
-- existing installation and keeps temporary provider saturation from being
-- counted as a customer generation failure.

ALTER TABLE public.generations
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS generations_job_ready_idx
  ON public.generations (status, next_attempt_at, created_at)
  WHERE status IN ('queued', 'processing_tryon');

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
SET search_path = ''
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
SET search_path = ''
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

CREATE OR REPLACE FUNCTION public.defer_generation_for_ai_capacity(
  p_generation_id UUID,
  p_user_id UUID,
  p_delay_seconds INTEGER DEFAULT 15,
  p_reason TEXT DEFAULT 'AI provider capacity is temporarily unavailable'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated UUID;
BEGIN
  UPDATE public.generations g
  SET
    status = 'queued',
    processing_started_at = NULL,
    next_attempt_at = now() + make_interval(secs => least(greatest(p_delay_seconds, 5), 300)),
    job_attempts = greatest(COALESCE(g.job_attempts, 0) - 1, 0),
    error_message = left(COALESCE(NULLIF(trim(p_reason), ''), 'AI provider capacity is temporarily unavailable'), 500),
    completed_at = NULL
  WHERE g.id = p_generation_id
    AND g.user_id = p_user_id
    AND g.status = 'processing_tryon'
  RETURNING g.id INTO v_updated;

  RETURN v_updated IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_generation_job(UUID, INTERVAL) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_next_generation_jobs(INTEGER, INTERVAL) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.defer_generation_for_ai_capacity(UUID, UUID, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_generation_job(UUID, INTERVAL) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_next_generation_jobs(INTEGER, INTERVAL) TO service_role;
GRANT EXECUTE ON FUNCTION public.defer_generation_for_ai_capacity(UUID, UUID, INTEGER, TEXT) TO service_role;

COMMENT ON COLUMN public.generations.next_attempt_at IS
  'Earliest time a queued generation may be claimed again after AI provider capacity backpressure.';
