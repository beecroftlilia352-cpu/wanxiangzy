-- OSS mirror outbox observability + recovery hardening.
--
-- The queue already enforces lease-based, idempotent transfer publication from
-- the application layer. This migration adds the missing Postgres surface the
-- admin and the deploy gate rely on:
--   * a stable health RPC exposing pending/processing/completed/failed counts
--     and the age of the oldest pending row so dashboards can alert on stalls;
--   * a recovery RPC that turns orphaned rows stuck in `processing` past their
--     lease back into `pending` so the worker loop can reclaim them safely;
--   * supporting indexes for the new health and recovery queries.
--
-- All RPCs are SECURITY DEFINER with an empty search_path and are only granted
-- to the service role, matching the existing OSS mirror and BullMQ contracts.

DROP FUNCTION IF EXISTS public.recover_oss_mirror_transfers(INTEGER);
DROP FUNCTION IF EXISTS public.get_oss_mirror_queue_health();

CREATE INDEX IF NOT EXISTS oss_mirror_transfers_status_next_attempt_idx
  ON public.oss_mirror_transfers (status, next_attempt_at, created_at)
  WHERE status IN ('pending', 'processing');

CREATE INDEX IF NOT EXISTS oss_mirror_transfers_pending_age_idx
  ON public.oss_mirror_transfers (created_at)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.get_oss_mirror_queue_health()
RETURNS TABLE(
  pending_count BIGINT,
  processing_count BIGINT,
  completed_count BIGINT,
  failed_count BIGINT,
  oldest_pending_age_seconds BIGINT,
  oldest_processing_age_seconds BIGINT,
  stale_processing_count BIGINT,
  last_recovered_at TIMESTAMPTZ,
  last_completed_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH counts AS (
    SELECT
      count(*) FILTER (WHERE transfer.status = 'pending') AS pending_count,
      count(*) FILTER (WHERE transfer.status = 'processing') AS processing_count,
      count(*) FILTER (WHERE transfer.status = 'completed') AS completed_count,
      count(*) FILTER (WHERE transfer.status = 'failed') AS failed_count,
      count(*) FILTER (
        WHERE transfer.status = 'processing'
          AND transfer.lease_expires_at IS NOT NULL
          AND transfer.lease_expires_at <= now()
      ) AS stale_processing_count,
      COALESCE(FLOOR(EXTRACT(EPOCH FROM (now() - min(transfer.created_at) FILTER (
        WHERE transfer.status = 'pending'
      ))))::BIGINT, 0) AS oldest_pending_age_seconds,
      COALESCE(FLOOR(EXTRACT(EPOCH FROM (now() - min(transfer.created_at) FILTER (
        WHERE transfer.status = 'processing'
      ))))::BIGINT, 0) AS oldest_processing_age_seconds,
      max(transfer.updated_at) FILTER (WHERE transfer.status IN ('pending', 'processing')) AS last_recovered_at,
      max(transfer.completed_at) AS last_completed_at
    FROM public.oss_mirror_transfers AS transfer
  )
  SELECT
    counts.pending_count,
    counts.processing_count,
    counts.completed_count,
    counts.failed_count,
    counts.oldest_pending_age_seconds,
    counts.oldest_processing_age_seconds,
    counts.stale_processing_count,
    counts.last_recovered_at,
    counts.last_completed_at
  FROM counts;
$$;

REVOKE ALL ON FUNCTION public.get_oss_mirror_queue_health()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_oss_mirror_queue_health() TO service_role;

CREATE OR REPLACE FUNCTION public.recover_oss_mirror_transfers(
  p_limit INTEGER DEFAULT 50,
  p_stale_lease_seconds INTEGER DEFAULT 480
)
RETURNS TABLE(
  recovered_id UUID,
  generation_ref TEXT,
  attempts INTEGER,
  status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'INVALID_RECOVER_LIMIT' USING ERRCODE = '22023';
  END IF;
  IF p_stale_lease_seconds IS NULL OR p_stale_lease_seconds < 30
    OR p_stale_lease_seconds > 3600 THEN
    RAISE EXCEPTION 'INVALID_STALE_LEASE_SECONDS' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH stale AS (
    SELECT transfer.id, transfer.attempts
    FROM public.oss_mirror_transfers AS transfer
    WHERE transfer.status = 'processing'
      AND transfer.lease_expires_at IS NOT NULL
      -- lease_expires_at already includes the processing budget; reclaim as
      -- soon as it expires. The stale argument is retained for API stability.
      AND transfer.lease_expires_at <= now()
    ORDER BY transfer.lease_expires_at, transfer.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  ),
  released AS (
    UPDATE public.oss_mirror_transfers AS transfer
    SET status = 'pending',
        lease_token = NULL,
        lease_version = transfer.lease_version + 1,
        lease_expires_at = NULL,
        claimed_by = NULL,
        next_attempt_at = now(),
        last_error = CASE
          WHEN transfer.last_error IS NULL
            OR transfer.last_error LIKE 'recovery: %'
          THEN 'recovery: lease expired before completion'
          ELSE 'recovery: ' || left(transfer.last_error, 800)
        END,
        updated_at = now()
    FROM stale
    WHERE transfer.id = stale.id
    RETURNING transfer.id, transfer.generation_ref, transfer.attempts, transfer.status
  )
  SELECT released.id, released.generation_ref, released.attempts, released.status
  FROM released;
END;
$$;

REVOKE ALL ON FUNCTION public.recover_oss_mirror_transfers(INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recover_oss_mirror_transfers(INTEGER, INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.get_oss_mirror_queue_health() IS
  'Aggregate counts and ages for the OSS mirror outbox. Powers admin dashboards and the production deploy gate.';
COMMENT ON FUNCTION public.recover_oss_mirror_transfers(INTEGER, INTEGER) IS
  'Returns stuck OSS mirror rows whose leases have expired so they can be re-published. Bounded to service role only.';
