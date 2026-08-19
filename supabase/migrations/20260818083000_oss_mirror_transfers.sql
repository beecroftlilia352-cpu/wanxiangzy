-- Durable provider-result -> Aliyun OSS transfer queue.
-- Provider capabilities stay encrypted and service-only, and are erased on
-- terminal settlement. Every mutation is protected by a lease token plus a
-- monotonically increasing fence version so a stale worker cannot publish.

-- Clean-slate migration: this intentionally discards the legacy mapping queue
-- and every dependent RPC. Historical provider URLs are not migrated.
DROP TABLE IF EXISTS public.oss_mirror_transfers CASCADE;

CREATE TABLE public.oss_mirror_transfers (
  id UUID PRIMARY KEY,
  object_key TEXT NOT NULL UNIQUE,
  generation_ref TEXT NOT NULL UNIQUE,
  owner_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  media_asset_id UUID NULL,
  source_url_ciphertext TEXT NULL,
  source_url_sha256 TEXT NULL,
  source_host TEXT NOT NULL,
  transfer_mode TEXT NOT NULL CHECK (transfer_mode IN ('mirror', 'stream')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 8 CHECK (max_attempts BETWEEN 1 AND 16),
  lease_token UUID NULL,
  lease_version BIGINT NOT NULL DEFAULT 0 CHECK (lease_version >= 0),
  lease_expires_at TIMESTAMPTZ NULL,
  claimed_by TEXT NULL,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  expires_at TIMESTAMPTZ NOT NULL,
  expected_content_length BIGINT NOT NULL CHECK (expected_content_length BETWEEN 1 AND 536870912),
  expected_content_type TEXT NOT NULL CHECK (expected_content_type ~ '^(image|video|audio)/[a-z0-9.+-]+$'),
  content_length BIGINT NULL CHECK (content_length IS NULL OR content_length BETWEEN 1 AND 536870912),
  content_type TEXT NULL CHECK (content_type IS NULL OR content_type ~ '^(image|video|audio)/[a-z0-9.+-]+$'),
  content_sha256 TEXT NULL CHECK (content_sha256 IS NULL OR content_sha256 ~ '^[0-9a-f]{64}$'),
  checksum_kind TEXT NULL CHECK (checksum_kind IS NULL OR checksum_kind IN ('sha256', 'oss-etag', 'oss-crc64')),
  etag TEXT NULL,
  last_error TEXT NULL,
  resolver_hits INTEGER NOT NULL DEFAULT 0 CHECK (resolver_hits >= 0),
  last_resolved_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  verified_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT oss_mirror_source_lifecycle CHECK (
    (status IN ('pending', 'processing') AND source_url_ciphertext IS NOT NULL AND source_url_sha256 ~ '^[0-9a-f]{64}$')
    OR (status IN ('completed', 'failed') AND source_url_ciphertext IS NULL AND source_url_sha256 IS NULL)
  ),
  CONSTRAINT oss_mirror_lease_lifecycle CHECK (
    (status = 'processing' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL AND claimed_by IS NOT NULL)
    OR (status <> 'processing' AND lease_token IS NULL AND lease_expires_at IS NULL AND claimed_by IS NULL)
  ),
  CONSTRAINT oss_mirror_completion_lifecycle CHECK (
    status <> 'completed'
    OR (
      content_length IS NOT NULL
      AND content_type IS NOT NULL
      AND content_sha256 IS NOT NULL
      AND checksum_kind = 'sha256'
      AND media_asset_id IS NOT NULL
      AND completed_at IS NOT NULL
      AND verified_at IS NOT NULL
    )
  )
);

ALTER TABLE public.oss_mirror_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oss_mirror_transfers FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.oss_mirror_transfers FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.oss_mirror_transfers TO service_role;

CREATE INDEX IF NOT EXISTS oss_mirror_transfers_claim_idx
  ON public.oss_mirror_transfers (next_attempt_at, created_at, id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS oss_mirror_transfers_expiry_idx
  ON public.oss_mirror_transfers (expires_at, created_at)
  WHERE status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS oss_mirror_transfers_owner_idx
  ON public.oss_mirror_transfers (owner_user_id, created_at DESC);

DROP FUNCTION IF EXISTS public.register_oss_mirror_transfer(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, BIGINT, TEXT, TIMESTAMPTZ, TEXT, INTEGER);
CREATE OR REPLACE FUNCTION public.register_oss_mirror_transfer(
  p_id UUID,
  p_object_key TEXT,
  p_source_url_ciphertext TEXT,
  p_source_url_sha256 TEXT,
  p_source_host TEXT,
  p_generation_ref TEXT,
  p_owner_user_id UUID,
  p_expected_content_length BIGINT,
  p_expected_content_type TEXT,
  p_expires_at TIMESTAMPTZ,
  p_transfer_mode TEXT,
  p_max_attempts INTEGER
)
RETURNS SETOF public.oss_mirror_transfers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing public.oss_mirror_transfers%ROWTYPE;
BEGIN
  IF COALESCE((SELECT auth.role()), '') <> 'service_role' THEN
    RAISE EXCEPTION 'OSS_MIRROR_SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_id IS NULL OR p_owner_user_id IS NULL
     OR octet_length(btrim(COALESCE(p_object_key, ''))) NOT BETWEEN 1 AND 1023
     OR char_length(btrim(COALESCE(p_generation_ref, ''))) NOT BETWEEN 1 AND 240
     OR char_length(btrim(COALESCE(p_source_url_ciphertext, ''))) NOT BETWEEN 32 AND 65535
     OR lower(btrim(COALESCE(p_source_url_sha256, ''))) !~ '^[0-9a-f]{64}$'
     OR lower(btrim(COALESCE(p_source_host, ''))) !~ '^[a-z0-9][a-z0-9.-]*[a-z0-9]$'
     OR p_expected_content_length NOT BETWEEN 1 AND 536870912
     OR lower(btrim(COALESCE(p_expected_content_type, ''))) !~ '^(image|video|audio)/[a-z0-9.+-]+$'
     OR p_expires_at <= clock_timestamp()
     OR p_expires_at > clock_timestamp() + INTERVAL '24 hours'
     OR p_transfer_mode NOT IN ('mirror', 'stream')
     OR p_max_attempts NOT BETWEEN 1 AND 16 THEN
    RAISE EXCEPTION 'INVALID_OSS_MIRROR_TRANSFER' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(btrim(p_generation_ref), 0));
  SELECT transfer.* INTO v_existing
  FROM public.oss_mirror_transfers AS transfer
  WHERE transfer.generation_ref = btrim(p_generation_ref)
  FOR UPDATE;

  IF FOUND THEN
    -- object_key/id are generated before the idempotency lock and therefore
    -- legitimately differ on a caller retry. The durable generation reference
    -- plus immutable owner/content fingerprint selects the original row.
    IF v_existing.owner_user_id IS DISTINCT FROM p_owner_user_id
       OR v_existing.source_host <> lower(btrim(p_source_host))
       OR v_existing.expected_content_length <> p_expected_content_length
       OR v_existing.expected_content_type <> lower(btrim(p_expected_content_type))
       OR v_existing.transfer_mode <> p_transfer_mode THEN
      RAISE EXCEPTION 'OSS_MIRROR_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    RETURN NEXT v_existing;
    RETURN;
  END IF;

  INSERT INTO public.oss_mirror_transfers (
    id, object_key, generation_ref, owner_user_id, source_url_ciphertext,
    source_url_sha256, source_host, transfer_mode, max_attempts, expires_at,
    expected_content_length, expected_content_type
  ) VALUES (
    p_id, btrim(p_object_key), btrim(p_generation_ref), p_owner_user_id,
    p_source_url_ciphertext, lower(btrim(p_source_url_sha256)), lower(btrim(p_source_host)),
    p_transfer_mode, p_max_attempts, p_expires_at, p_expected_content_length,
    lower(btrim(p_expected_content_type))
  )
  RETURNING * INTO v_existing;
  RETURN NEXT v_existing;
END;
$$;

DROP FUNCTION IF EXISTS public.claim_oss_mirror_transfers(INTEGER, INTEGER, TEXT);
CREATE OR REPLACE FUNCTION public.claim_oss_mirror_transfers(
  p_limit INTEGER DEFAULT 20,
  p_lease_seconds INTEGER DEFAULT 480,
  p_worker_id TEXT DEFAULT 'oss-mirror'
)
RETURNS SETOF public.oss_mirror_transfers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE((SELECT auth.role()), '') <> 'service_role' THEN
    RAISE EXCEPTION 'OSS_MIRROR_SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_limit NOT BETWEEN 1 AND 100 OR p_lease_seconds NOT BETWEEN 30 AND 900
     OR char_length(btrim(COALESCE(p_worker_id, ''))) NOT BETWEEN 3 AND 128 THEN
    RAISE EXCEPTION 'INVALID_OSS_MIRROR_CLAIM' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT transfer.id
    FROM public.oss_mirror_transfers AS transfer
    WHERE transfer.status = 'pending'
      AND transfer.next_attempt_at <= clock_timestamp()
      AND transfer.expires_at > clock_timestamp()
      AND transfer.attempts < transfer.max_attempts
    ORDER BY transfer.next_attempt_at, transfer.created_at, transfer.id
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE public.oss_mirror_transfers AS transfer
  SET status = 'processing',
      attempts = transfer.attempts + 1,
      lease_token = gen_random_uuid(),
      lease_version = transfer.lease_version + 1,
      lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
      claimed_by = btrim(p_worker_id),
      updated_at = clock_timestamp()
  FROM candidates
  WHERE transfer.id = candidates.id
  RETURNING transfer.*;
END;
$$;

DROP FUNCTION IF EXISTS public.heartbeat_oss_mirror_transfer(UUID, UUID, BIGINT, INTEGER);
CREATE OR REPLACE FUNCTION public.heartbeat_oss_mirror_transfer(
  p_id UUID,
  p_lease_token UUID,
  p_lease_version BIGINT,
  p_lease_seconds INTEGER DEFAULT 480
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE((SELECT auth.role()), '') <> 'service_role' THEN
    RAISE EXCEPTION 'OSS_MIRROR_SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_lease_seconds NOT BETWEEN 30 AND 900 THEN
    RAISE EXCEPTION 'INVALID_OSS_MIRROR_LEASE_SECONDS' USING ERRCODE = '22023';
  END IF;
  UPDATE public.oss_mirror_transfers AS transfer
  SET lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
      updated_at = clock_timestamp()
  WHERE transfer.id = p_id
    AND transfer.status = 'processing'
    AND transfer.lease_token = p_lease_token
    AND transfer.lease_version = p_lease_version
    AND transfer.lease_expires_at > clock_timestamp();
  RETURN FOUND;
END;
$$;

DROP FUNCTION IF EXISTS public.complete_oss_mirror_transfer(UUID, UUID, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, UUID);
CREATE OR REPLACE FUNCTION public.complete_oss_mirror_transfer(
  p_id UUID,
  p_lease_token UUID,
  p_lease_version BIGINT,
  p_content_length BIGINT,
  p_content_type TEXT,
  p_content_sha256 TEXT,
  p_checksum_kind TEXT,
  p_etag TEXT,
  p_media_asset_id UUID
)
RETURNS SETOF public.oss_mirror_transfers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_transfer public.oss_mirror_transfers%ROWTYPE;
BEGIN
  IF COALESCE((SELECT auth.role()), '') <> 'service_role' THEN
    RAISE EXCEPTION 'OSS_MIRROR_SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  SELECT transfer.* INTO v_transfer
  FROM public.oss_mirror_transfers AS transfer
  WHERE transfer.id = p_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OSS_MIRROR_TRANSFER_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_transfer.status = 'completed' THEN
    IF v_transfer.content_length = p_content_length
       AND v_transfer.content_type = lower(btrim(p_content_type))
       AND v_transfer.content_sha256 = lower(btrim(p_content_sha256))
       AND v_transfer.media_asset_id = p_media_asset_id THEN
      RETURN NEXT v_transfer;
      RETURN;
    END IF;
    RAISE EXCEPTION 'OSS_MIRROR_COMPLETION_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
  END IF;
  IF v_transfer.status <> 'processing'
     OR v_transfer.lease_token IS DISTINCT FROM p_lease_token
     OR v_transfer.lease_version <> p_lease_version
     OR v_transfer.lease_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'STALE_OSS_MIRROR_FENCE' USING ERRCODE = '40001';
  END IF;
  IF p_content_length <> v_transfer.expected_content_length
     OR lower(btrim(p_content_type)) <> v_transfer.expected_content_type
     OR lower(btrim(COALESCE(p_content_sha256, ''))) !~ '^[0-9a-f]{64}$'
     OR p_checksum_kind <> 'sha256'
     OR p_media_asset_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_OSS_MIRROR_COMPLETION' USING ERRCODE = '22023';
  END IF;

  UPDATE public.oss_mirror_transfers AS transfer
  SET status = 'completed', content_length = p_content_length,
      content_type = lower(btrim(p_content_type)), content_sha256 = lower(btrim(p_content_sha256)),
      checksum_kind = 'sha256', etag = NULLIF(btrim(COALESCE(p_etag, '')), ''),
      media_asset_id = p_media_asset_id, completed_at = clock_timestamp(),
      verified_at = clock_timestamp(), source_url_ciphertext = NULL,
      source_url_sha256 = NULL, lease_token = NULL, lease_expires_at = NULL,
      claimed_by = NULL, last_error = NULL, updated_at = clock_timestamp()
  WHERE transfer.id = p_id
  RETURNING transfer.* INTO v_transfer;
  RETURN NEXT v_transfer;
END;
$$;

DROP FUNCTION IF EXISTS public.defer_oss_mirror_transfer(UUID, UUID, BIGINT, TEXT, BOOLEAN, INTEGER);
CREATE OR REPLACE FUNCTION public.defer_oss_mirror_transfer(
  p_id UUID,
  p_lease_token UUID,
  p_lease_version BIGINT,
  p_error TEXT,
  p_retryable BOOLEAN DEFAULT true,
  p_delay_seconds INTEGER DEFAULT 60
)
RETURNS SETOF public.oss_mirror_transfers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_transfer public.oss_mirror_transfers%ROWTYPE;
  v_failed BOOLEAN;
BEGIN
  IF COALESCE((SELECT auth.role()), '') <> 'service_role' THEN
    RAISE EXCEPTION 'OSS_MIRROR_SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_delay_seconds NOT BETWEEN 1 AND 3600 THEN
    RAISE EXCEPTION 'INVALID_OSS_MIRROR_DELAY' USING ERRCODE = '22023';
  END IF;
  SELECT transfer.* INTO v_transfer FROM public.oss_mirror_transfers AS transfer
  WHERE transfer.id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'OSS_MIRROR_TRANSFER_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF v_transfer.status = 'completed' THEN RETURN NEXT v_transfer; RETURN; END IF;
  IF v_transfer.status <> 'processing'
     OR v_transfer.lease_token IS DISTINCT FROM p_lease_token
     OR v_transfer.lease_version <> p_lease_version THEN
    RAISE EXCEPTION 'STALE_OSS_MIRROR_FENCE' USING ERRCODE = '40001';
  END IF;
  v_failed := NOT COALESCE(p_retryable, true)
    OR v_transfer.attempts >= v_transfer.max_attempts
    OR clock_timestamp() + make_interval(secs => p_delay_seconds) >= v_transfer.expires_at;
  UPDATE public.oss_mirror_transfers AS transfer
  SET status = CASE WHEN v_failed THEN 'failed' ELSE 'pending' END,
      next_attempt_at = CASE WHEN v_failed THEN transfer.next_attempt_at ELSE clock_timestamp() + make_interval(secs => p_delay_seconds) END,
      last_error = left(btrim(COALESCE(p_error, 'OSS mirror transfer failed')), 2000),
      source_url_ciphertext = CASE WHEN v_failed THEN NULL ELSE transfer.source_url_ciphertext END,
      source_url_sha256 = CASE WHEN v_failed THEN NULL ELSE transfer.source_url_sha256 END,
      lease_token = NULL, lease_expires_at = NULL, claimed_by = NULL,
      updated_at = clock_timestamp()
  WHERE transfer.id = p_id
  RETURNING transfer.* INTO v_transfer;
  RETURN NEXT v_transfer;
END;
$$;

DROP FUNCTION IF EXISTS public.expire_oss_mirror_transfers(INTEGER);
CREATE OR REPLACE FUNCTION public.expire_oss_mirror_transfers(p_limit INTEGER DEFAULT 500)
RETURNS SETOF public.oss_mirror_transfers
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF COALESCE((SELECT auth.role()), '') <> 'service_role' THEN RAISE EXCEPTION 'OSS_MIRROR_SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF p_limit NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'INVALID_OSS_MIRROR_EXPIRE_LIMIT' USING ERRCODE = '22023'; END IF;
  RETURN QUERY
  WITH expired AS (
    SELECT transfer.id FROM public.oss_mirror_transfers AS transfer
    WHERE transfer.status IN ('pending', 'processing') AND transfer.expires_at <= clock_timestamp()
    ORDER BY transfer.expires_at FOR UPDATE SKIP LOCKED LIMIT p_limit
  )
  UPDATE public.oss_mirror_transfers AS transfer
  SET status = 'failed', source_url_ciphertext = NULL, source_url_sha256 = NULL,
      lease_token = NULL, lease_expires_at = NULL, claimed_by = NULL,
      last_error = 'OSS mirror source capability expired', updated_at = clock_timestamp()
  FROM expired WHERE transfer.id = expired.id RETURNING transfer.*;
END; $$;

DROP FUNCTION IF EXISTS public.cleanup_oss_mirror_transfers(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER);
CREATE OR REPLACE FUNCTION public.cleanup_oss_mirror_transfers(
  p_completed_before TIMESTAMPTZ,
  p_failed_before TIMESTAMPTZ,
  p_limit INTEGER DEFAULT 1000
)
RETURNS TABLE(id UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF COALESCE((SELECT auth.role()), '') <> 'service_role' THEN RAISE EXCEPTION 'OSS_MIRROR_SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF p_limit NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'INVALID_OSS_MIRROR_CLEANUP_LIMIT' USING ERRCODE = '22023'; END IF;
  RETURN QUERY
  WITH doomed AS (
    SELECT transfer.id FROM public.oss_mirror_transfers AS transfer
    WHERE (transfer.status = 'completed' AND transfer.updated_at < p_completed_before)
       OR (transfer.status = 'failed' AND transfer.updated_at < p_failed_before)
    ORDER BY transfer.updated_at FOR UPDATE SKIP LOCKED LIMIT p_limit
  )
  DELETE FROM public.oss_mirror_transfers AS transfer USING doomed
  WHERE transfer.id = doomed.id RETURNING transfer.id;
END; $$;

DROP FUNCTION IF EXISTS public.record_oss_mirror_resolution(UUID);
CREATE OR REPLACE FUNCTION public.record_oss_mirror_resolution(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF COALESCE((SELECT auth.role()), '') <> 'service_role' THEN RAISE EXCEPTION 'OSS_MIRROR_SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501'; END IF;
  UPDATE public.oss_mirror_transfers AS transfer
  SET resolver_hits = transfer.resolver_hits + 1, last_resolved_at = clock_timestamp(), updated_at = clock_timestamp()
  WHERE transfer.id = p_id AND transfer.status IN ('pending', 'processing') AND transfer.expires_at > clock_timestamp();
  RETURN FOUND;
END; $$;

REVOKE ALL ON FUNCTION public.register_oss_mirror_transfer(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, BIGINT, TEXT, TIMESTAMPTZ, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_oss_mirror_transfers(INTEGER, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.heartbeat_oss_mirror_transfer(UUID, UUID, BIGINT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_oss_mirror_transfer(UUID, UUID, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.defer_oss_mirror_transfer(UUID, UUID, BIGINT, TEXT, BOOLEAN, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_oss_mirror_transfers(INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_oss_mirror_transfers(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_oss_mirror_resolution(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_oss_mirror_transfer(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, BIGINT, TEXT, TIMESTAMPTZ, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_oss_mirror_transfers(INTEGER, INTEGER, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.heartbeat_oss_mirror_transfer(UUID, UUID, BIGINT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_oss_mirror_transfer(UUID, UUID, BIGINT, BIGINT, TEXT, TEXT, TEXT, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.defer_oss_mirror_transfer(UUID, UUID, BIGINT, TEXT, BOOLEAN, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_oss_mirror_transfers(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_oss_mirror_transfers(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_oss_mirror_resolution(UUID) TO service_role;
