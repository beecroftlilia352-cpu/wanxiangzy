-- Commercial Aliyun OSS media-asset control plane (clean slate).
--
-- Security boundaries:
--   * private.media_assets is the canonical object inventory. It is not exposed
--     through the Data API and never stores access keys or signed URLs.
--   * public.media_asset_records is a deliberately small, read-only projection.
--   * every mutation goes through a SECURITY DEFINER RPC with an empty
--     search_path, explicit grants, tenant checks, idempotency, and fencing.
--
-- Lifecycle:
--   pending -> uploaded -> verified
--          \-> quarantined
--   any retained non-deleted state -> cleanup lease -> deleted

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;

DO $migration$
BEGIN
  IF to_regclass('public.resource_library_assets') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS resource_library_assets_validate_media_asset
      ON public.resource_library_assets;
  END IF;
  IF to_regclass('public.oss_mirror_transfers') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS oss_mirror_transfers_validate_media_asset
      ON public.oss_mirror_transfers;
  END IF;
  IF to_regclass('public.generations') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS generations_detach_media_asset_links
      ON public.generations;
  END IF;
END;
$migration$;

-- Drop tables first so their triggers and row-type dependent functions cannot
-- block a deterministic clean-slate rebuild.
DROP TABLE IF EXISTS public.media_asset_records;
DROP TABLE IF EXISTS private.media_asset_links;
DROP TABLE IF EXISTS private.media_validation_jobs;
DROP TABLE IF EXISTS private.media_assets CASCADE;

DROP FUNCTION IF EXISTS public.create_media_asset_upload(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, INTEGER, INTEGER, TIMESTAMPTZ, INTEGER);
DROP FUNCTION IF EXISTS public.create_media_asset_upload(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, INTEGER, INTEGER, TIMESTAMPTZ, INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.complete_media_asset_upload(UUID, UUID, BIGINT, TEXT, BIGINT, TEXT, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.verify_media_asset(UUID, BIGINT);
DROP FUNCTION IF EXISTS public.fail_media_asset_upload(UUID, UUID, BIGINT, TEXT);
DROP FUNCTION IF EXISTS public.claim_media_asset_cleanup(INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.authorize_media_asset_cleanup(UUID, UUID, BIGINT);
DROP FUNCTION IF EXISTS public.confirm_media_asset_cleanup(UUID, UUID, BIGINT);
DROP FUNCTION IF EXISTS public.nack_media_asset_cleanup(UUID, UUID, BIGINT, TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.set_media_asset_legal_hold(UUID, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.attach_media_asset_reference(UUID, UUID, TEXT, UUID, TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.detach_media_asset_reference(TEXT, UUID, TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.resolve_media_asset_object(UUID);
DROP FUNCTION IF EXISTS public.resolve_verified_media_asset_for_worker(UUID, UUID);
DROP FUNCTION IF EXISTS public.get_media_asset_status(UUID, UUID);
DROP FUNCTION IF EXISTS public.get_media_asset_lifecycle_health();
DROP FUNCTION IF EXISTS public.claim_media_validation_jobs(INTEGER, INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.heartbeat_media_validation_job(UUID, UUID, BIGINT, INTEGER);
DROP FUNCTION IF EXISTS public.complete_media_validation_job(UUID, UUID, BIGINT, TEXT, BIGINT, TEXT, INTEGER, INTEGER, BIGINT, JSONB);
DROP FUNCTION IF EXISTS public.defer_media_validation_job(UUID, UUID, BIGINT, TEXT, BOOLEAN, INTEGER);
DROP FUNCTION IF EXISTS public.recover_media_validation_jobs(INTEGER);
DROP FUNCTION IF EXISTS public.get_media_validation_queue_health();
DROP FUNCTION IF EXISTS private.sync_media_asset_record();
DROP FUNCTION IF EXISTS private.enqueue_media_validation_job();
DROP FUNCTION IF EXISTS private.media_asset_has_active_reference(UUID);
DROP FUNCTION IF EXISTS private.validate_resource_library_media_asset_reference();
DROP FUNCTION IF EXISTS private.validate_oss_mirror_media_asset_reference();
DROP FUNCTION IF EXISTS private.detach_generation_media_asset_links();

CREATE TABLE private.media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  purpose TEXT NOT NULL
    CHECK (purpose ~ '^[a-z][a-z0-9_]{1,63}$'),
  visibility TEXT NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'public')),
  storage_class TEXT NOT NULL DEFAULT 'standard'
    CHECK (storage_class IN (
      'standard',
      'infrequent_access',
      'archive',
      'cold_archive',
      'deep_cold_archive'
    )),
  bucket_name TEXT NOT NULL DEFAULT 'primary'
    CHECK (bucket_name ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'),
  object_key TEXT NOT NULL UNIQUE
    CHECK (
      object_key = btrim(object_key)
      AND octet_length(object_key) BETWEEN 1 AND 1023
      AND position(chr(92) IN object_key) = 0
      AND object_key !~ '(^/|//|(^|/)\.{1,2}(/|$)|://|[[:cntrl:]])'
    ),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'uploaded', 'verified', 'quarantined', 'deleted')),

  expected_sha256 TEXT
    CHECK (expected_sha256 IS NULL OR expected_sha256 ~ '^[0-9a-f]{64}$'),
  expected_size_bytes BIGINT
    CHECK (expected_size_bytes IS NULL OR expected_size_bytes BETWEEN 1 AND 5497558138880),
  expected_mime_type TEXT
    CHECK (
      expected_mime_type IS NULL
      OR expected_mime_type ~ '^[a-z0-9][a-z0-9.+-]{0,62}/[a-z0-9][a-z0-9.+-]{0,62}$'
    ),
  expected_width INTEGER CHECK (expected_width IS NULL OR expected_width BETWEEN 1 AND 100000),
  expected_height INTEGER CHECK (expected_height IS NULL OR expected_height BETWEEN 1 AND 100000),

  sha256 TEXT CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes BIGINT CHECK (size_bytes IS NULL OR size_bytes BETWEEN 1 AND 5497558138880),
  mime_type TEXT CHECK (
    mime_type IS NULL
    OR mime_type ~ '^[a-z0-9][a-z0-9.+-]{0,62}/[a-z0-9][a-z0-9.+-]{0,62}$'
  ),
  width INTEGER CHECK (width IS NULL OR width BETWEEN 1 AND 100000),
  height INTEGER CHECK (height IS NULL OR height BETWEEN 1 AND 100000),
  duration_ms BIGINT CHECK (duration_ms IS NULL OR duration_ms BETWEEN 1 AND 86400000),

  idempotency_key TEXT NOT NULL
    CHECK (idempotency_key = btrim(idempotency_key) AND char_length(idempotency_key) BETWEEN 8 AND 160),
  request_fingerprint JSONB NOT NULL CHECK (jsonb_typeof(request_fingerprint) = 'object'),
  fence_version BIGINT NOT NULL DEFAULT 1 CHECK (fence_version >= 1),
  lease_kind TEXT CHECK (lease_kind IN ('upload', 'cleanup')),
  lease_token UUID,
  lease_expires_at TIMESTAMPTZ,
  cleanup_attempts INTEGER NOT NULL DEFAULT 0 CHECK (cleanup_attempts >= 0),
  cleanup_authorized_at TIMESTAMPTZ,

  upload_settlement_token UUID,
  upload_settlement_fence_version BIGINT,
  upload_settlement_kind TEXT CHECK (upload_settlement_kind IN ('complete', 'fail')),
  upload_settlement_fingerprint JSONB
    CHECK (upload_settlement_fingerprint IS NULL OR jsonb_typeof(upload_settlement_fingerprint) = 'object'),
  verified_from_fence_version BIGINT,
  cleanup_settlement_token UUID,
  cleanup_settlement_fence_version BIGINT,
  cleanup_settlement_kind TEXT CHECK (cleanup_settlement_kind IN ('confirm', 'nack')),

  retention_until TIMESTAMPTZ,
  legal_hold BOOLEAN NOT NULL DEFAULT false,
  legal_hold_reason TEXT CHECK (legal_hold_reason IS NULL OR char_length(legal_hold_reason) <= 500),
  last_error TEXT CHECK (last_error IS NULL OR char_length(last_error) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  uploaded_at TIMESTAMPTZ,
  checksum_verified_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  quarantined_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,

  CONSTRAINT media_assets_owner_idempotency_uidx UNIQUE (owner_user_id, idempotency_key),
  CONSTRAINT media_assets_expected_dimensions_pair_chk CHECK (
    (expected_width IS NULL) = (expected_height IS NULL)
  ),
  CONSTRAINT media_assets_dimensions_pair_chk CHECK ((width IS NULL) = (height IS NULL)),
  CONSTRAINT media_assets_lease_pair_chk CHECK (
    (lease_kind IS NULL AND lease_token IS NULL AND lease_expires_at IS NULL)
    OR (
      lease_kind IS NOT NULL
      AND lease_token IS NOT NULL
      AND lease_expires_at IS NOT NULL
      AND (
        (lease_kind = 'upload' AND status = 'pending')
        OR (lease_kind = 'cleanup' AND status <> 'deleted')
      )
    )
  ),
  CONSTRAINT media_assets_upload_settlement_pair_chk CHECK (
    (upload_settlement_token IS NULL
      AND upload_settlement_fence_version IS NULL
      AND upload_settlement_kind IS NULL
      AND upload_settlement_fingerprint IS NULL)
    OR (upload_settlement_token IS NOT NULL
      AND upload_settlement_fence_version IS NOT NULL
      AND upload_settlement_kind IS NOT NULL
      AND upload_settlement_fingerprint IS NOT NULL)
  ),
  CONSTRAINT media_assets_cleanup_settlement_pair_chk CHECK (
    (cleanup_settlement_token IS NULL
      AND cleanup_settlement_fence_version IS NULL
      AND cleanup_settlement_kind IS NULL)
    OR (cleanup_settlement_token IS NOT NULL
      AND cleanup_settlement_fence_version IS NOT NULL
      AND cleanup_settlement_kind IS NOT NULL)
  ),
  CONSTRAINT media_assets_cleanup_authorization_chk CHECK (
    cleanup_authorized_at IS NULL OR lease_kind = 'cleanup'
  ),
  CONSTRAINT media_assets_uploaded_metadata_chk CHECK (
    status NOT IN ('uploaded', 'verified')
    OR (uploaded_at IS NOT NULL AND sha256 IS NOT NULL AND size_bytes IS NOT NULL AND mime_type IS NOT NULL)
  ),
  CONSTRAINT media_assets_verified_state_chk CHECK (
    status <> 'verified'
    OR (verified_at IS NOT NULL AND checksum_verified_at IS NOT NULL)
  ),
  CONSTRAINT media_assets_quarantined_state_chk CHECK (
    status <> 'quarantined' OR quarantined_at IS NOT NULL
  ),
  CONSTRAINT media_assets_deleted_state_chk CHECK (
    (status = 'deleted' AND deleted_at IS NOT NULL AND legal_hold = false)
    OR (status <> 'deleted' AND deleted_at IS NULL)
  )
);

CREATE INDEX media_assets_owner_created_idx
  ON private.media_assets (owner_user_id, created_at DESC, id);
CREATE INDEX media_assets_cleanup_ready_idx
  ON private.media_assets (retention_until, created_at, id)
  WHERE status <> 'deleted' AND legal_hold = false AND retention_until IS NOT NULL;
CREATE INDEX media_assets_expired_lease_idx
  ON private.media_assets (lease_expires_at, created_at, id)
  WHERE lease_token IS NOT NULL;
CREATE INDEX media_assets_sha256_lookup_idx
  ON private.media_assets (owner_user_id, sha256)
  WHERE sha256 IS NOT NULL AND status IN ('uploaded', 'verified');

ALTER TABLE private.media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.media_assets FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.media_assets FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE private.media_validation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_asset_id UUID NOT NULL UNIQUE REFERENCES private.media_assets(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  media_kind TEXT NOT NULL CHECK (media_kind IN ('video')),
  asset_fence_version BIGINT NOT NULL CHECK (asset_fence_version >= 1),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'dead')),
  available_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 12 CHECK (max_attempts BETWEEN 1 AND 100),
  lease_token UUID,
  lease_version BIGINT NOT NULL DEFAULT 0 CHECK (lease_version >= 0),
  lease_expires_at TIMESTAMPTZ,
  claimed_by TEXT CHECK (claimed_by IS NULL OR char_length(claimed_by) BETWEEN 3 AND 128),
  last_worker_id TEXT CHECK (last_worker_id IS NULL OR char_length(last_worker_id) BETWEEN 3 AND 128),
  last_error TEXT CHECK (last_error IS NULL OR char_length(last_error) <= 2000),
  validation_outcome TEXT CHECK (validation_outcome IN ('verified', 'quarantined')),
  validation_result JSONB CHECK (
    validation_result IS NULL
    OR (
      jsonb_typeof(validation_result) = 'object'
      AND octet_length(validation_result::TEXT) <= 16384
    )
  ),
  settlement_token UUID,
  settlement_lease_version BIGINT,
  settlement_fingerprint JSONB CHECK (
    settlement_fingerprint IS NULL OR jsonb_typeof(settlement_fingerprint) = 'object'
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  completed_at TIMESTAMPTZ,
  dead_at TIMESTAMPTZ,
  CONSTRAINT media_validation_jobs_lease_state_chk CHECK (
    (status = 'processing'
      AND lease_token IS NOT NULL
      AND lease_expires_at IS NOT NULL
      AND claimed_by IS NOT NULL)
    OR (status <> 'processing'
      AND lease_token IS NULL
      AND lease_expires_at IS NULL
      AND claimed_by IS NULL)
  ),
  CONSTRAINT media_validation_jobs_completion_state_chk CHECK (
    (status = 'completed'
      AND completed_at IS NOT NULL
      AND validation_outcome IS NOT NULL
      AND settlement_token IS NOT NULL
      AND settlement_lease_version IS NOT NULL
      AND settlement_fingerprint IS NOT NULL)
    OR (status <> 'completed'
      AND completed_at IS NULL
      AND validation_outcome IS NULL)
  ),
  CONSTRAINT media_validation_jobs_dead_state_chk CHECK (
    (status = 'dead' AND dead_at IS NOT NULL)
    OR (status <> 'dead' AND dead_at IS NULL)
  )
);

CREATE INDEX media_validation_jobs_pending_claim_idx
  ON private.media_validation_jobs (available_at, created_at, id)
  WHERE status = 'pending';
CREATE INDEX media_validation_jobs_expired_lease_idx
  ON private.media_validation_jobs (lease_expires_at, created_at, id)
  WHERE status = 'processing';
CREATE INDEX media_validation_jobs_owner_status_idx
  ON private.media_validation_jobs (owner_user_id, status, created_at DESC, id);

ALTER TABLE private.media_validation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.media_validation_jobs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.media_validation_jobs FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE private.media_asset_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_asset_id UUID NOT NULL REFERENCES private.media_assets(id) ON DELETE RESTRICT,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  subject_type TEXT NOT NULL CHECK (subject_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  subject_id UUID NOT NULL,
  asset_role TEXT NOT NULL CHECK (asset_role ~ '^[a-z][a-z0-9_]{1,63}$'),
  ordinal INTEGER NOT NULL DEFAULT 0 CHECK (ordinal BETWEEN 0 AND 10000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT media_asset_links_subject_slot_uidx
    UNIQUE (subject_type, subject_id, asset_role, ordinal)
);

CREATE INDEX media_asset_links_asset_idx
  ON private.media_asset_links (media_asset_id, subject_type, subject_id);
CREATE INDEX media_asset_links_owner_subject_idx
  ON private.media_asset_links (owner_user_id, subject_type, subject_id);

ALTER TABLE private.media_asset_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.media_asset_links FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.media_asset_links FROM PUBLIC, anon, authenticated, service_role;

-- Safe Data API projection. Object keys, hashes, leases, errors, and request
-- fingerprints intentionally remain private.
CREATE TABLE public.media_asset_records (
  id UUID PRIMARY KEY REFERENCES private.media_assets(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  purpose TEXT NOT NULL,
  visibility TEXT NOT NULL,
  storage_class TEXT NOT NULL,
  status TEXT NOT NULL,
  size_bytes BIGINT,
  mime_type TEXT,
  width INTEGER,
  height INTEGER,
  duration_ms BIGINT,
  retention_until TIMESTAMPTZ,
  legal_hold BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  uploaded_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX media_asset_records_owner_created_idx
  ON public.media_asset_records (owner_user_id, created_at DESC, id);
CREATE INDEX media_asset_records_public_verified_idx
  ON public.media_asset_records (created_at DESC, id)
  WHERE visibility = 'public' AND status = 'verified';

ALTER TABLE public.media_asset_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_asset_records FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.media_asset_records FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.media_asset_records TO authenticated, service_role;

CREATE POLICY media_asset_records_read_own
  ON public.media_asset_records
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = owner_user_id);

CREATE OR REPLACE FUNCTION private.sync_media_asset_record()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.media_asset_records (
    id,
    owner_user_id,
    purpose,
    visibility,
    storage_class,
    status,
    size_bytes,
    mime_type,
    width,
    height,
    duration_ms,
    retention_until,
    legal_hold,
    created_at,
    uploaded_at,
    verified_at,
    deleted_at
  ) VALUES (
    NEW.id,
    NEW.owner_user_id,
    NEW.purpose,
    NEW.visibility,
    NEW.storage_class,
    NEW.status,
    NEW.size_bytes,
    NEW.mime_type,
    NEW.width,
    NEW.height,
    NEW.duration_ms,
    NEW.retention_until,
    NEW.legal_hold,
    NEW.created_at,
    NEW.uploaded_at,
    NEW.verified_at,
    NEW.deleted_at
  )
  ON CONFLICT (id) DO UPDATE
  SET owner_user_id = EXCLUDED.owner_user_id,
      purpose = EXCLUDED.purpose,
      visibility = EXCLUDED.visibility,
      storage_class = EXCLUDED.storage_class,
      status = EXCLUDED.status,
      size_bytes = EXCLUDED.size_bytes,
      mime_type = EXCLUDED.mime_type,
      width = EXCLUDED.width,
      height = EXCLUDED.height,
      duration_ms = EXCLUDED.duration_ms,
      retention_until = EXCLUDED.retention_until,
      legal_hold = EXCLUDED.legal_hold,
      created_at = EXCLUDED.created_at,
      uploaded_at = EXCLUDED.uploaded_at,
      verified_at = EXCLUDED.verified_at,
      deleted_at = EXCLUDED.deleted_at;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.sync_media_asset_record()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER media_assets_sync_public_record
  AFTER INSERT OR UPDATE ON private.media_assets
  FOR EACH ROW EXECUTE FUNCTION private.sync_media_asset_record();

CREATE OR REPLACE FUNCTION private.enqueue_media_validation_job()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'uploaded' AND NEW.mime_type LIKE 'video/%' THEN
    INSERT INTO private.media_validation_jobs (
      media_asset_id,
      owner_user_id,
      media_kind,
      asset_fence_version,
      available_at
    ) VALUES (
      NEW.id,
      NEW.owner_user_id,
      'video',
      NEW.fence_version,
      clock_timestamp()
    )
    ON CONFLICT (media_asset_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enqueue_media_validation_job()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER media_assets_enqueue_video_validation
  AFTER UPDATE OF status, mime_type ON private.media_assets
  FOR EACH ROW
  WHEN (NEW.status = 'uploaded' AND NEW.mime_type LIKE 'video/%')
  EXECUTE FUNCTION private.enqueue_media_validation_job();

CREATE OR REPLACE FUNCTION private.media_asset_has_active_reference(p_asset_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_referenced BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM private.media_asset_links AS link
    WHERE link.media_asset_id = p_asset_id
  ) INTO v_referenced;

  IF v_referenced THEN
    RETURN true;
  END IF;

  IF to_regclass('public.oss_mirror_transfers') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM pg_catalog.pg_attribute AS attribute
       WHERE attribute.attrelid = to_regclass('public.oss_mirror_transfers')
         AND attribute.attname = 'media_asset_id'
         AND NOT attribute.attisdropped
     ) THEN
    EXECUTE
      'SELECT EXISTS (SELECT 1 FROM public.oss_mirror_transfers WHERE media_asset_id = $1)'
      INTO v_referenced
      USING p_asset_id;
  END IF;

  IF v_referenced THEN
    RETURN true;
  END IF;

  -- Compatibility for deployments that already own resource_library_assets.
  -- The dynamic lookup keeps this clean-slate migration valid when that optional
  -- module has not been installed yet.
  IF to_regclass('public.resource_library_assets') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM pg_catalog.pg_attribute AS attribute
       WHERE attribute.attrelid = to_regclass('public.resource_library_assets')
         AND attribute.attname = 'media_asset_id'
         AND NOT attribute.attisdropped
     ) THEN
    EXECUTE
      'SELECT EXISTS (SELECT 1 FROM public.resource_library_assets WHERE media_asset_id = $1)'
      INTO v_referenced
      USING p_asset_id;
  END IF;

  RETURN COALESCE(v_referenced, false);
END;
$$;

REVOKE ALL ON FUNCTION private.media_asset_has_active_reference(UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_media_asset_upload(
  p_owner_user_id UUID,
  p_idempotency_key TEXT,
  p_object_key TEXT,
  p_purpose TEXT,
  p_visibility TEXT DEFAULT 'private',
  p_storage_class TEXT DEFAULT 'standard',
  p_expected_sha256 TEXT DEFAULT NULL,
  p_expected_size_bytes BIGINT DEFAULT NULL,
  p_expected_mime_type TEXT DEFAULT NULL,
  p_expected_width INTEGER DEFAULT NULL,
  p_expected_height INTEGER DEFAULT NULL,
  p_retention_until TIMESTAMPTZ DEFAULT NULL,
  p_lease_seconds INTEGER DEFAULT 900,
  p_bucket_name TEXT DEFAULT 'primary'
)
RETURNS TABLE(
  asset_id UUID,
  status TEXT,
  object_key TEXT,
  lease_token UUID,
  fence_version BIGINT,
  lease_expires_at TIMESTAMPTZ,
  replayed BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_role TEXT := COALESCE((SELECT auth.role()), '');
  v_idempotency_key TEXT := btrim(COALESCE(p_idempotency_key, ''));
  v_object_key TEXT := btrim(COALESCE(p_object_key, ''));
  v_purpose TEXT := lower(btrim(COALESCE(p_purpose, '')));
  v_visibility TEXT := lower(btrim(COALESCE(p_visibility, '')));
  v_storage_class TEXT := lower(btrim(COALESCE(p_storage_class, '')));
  v_bucket_name TEXT := lower(btrim(COALESCE(p_bucket_name, '')));
  v_expected_sha256 TEXT := lower(NULLIF(btrim(COALESCE(p_expected_sha256, '')), ''));
  v_expected_mime_type TEXT := lower(NULLIF(btrim(COALESCE(p_expected_mime_type, '')), ''));
  v_retention_until TIMESTAMPTZ;
  v_retention_policy TEXT;
  v_fingerprint JSONB;
  v_asset private.media_assets%ROWTYPE;
BEGIN
  IF p_owner_user_id IS NULL THEN
    RAISE EXCEPTION 'OWNER_USER_ID_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF v_actor_role <> 'service_role' THEN
    RAISE EXCEPTION 'MEDIA_ASSET_SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_lease_seconds IS NULL OR p_lease_seconds < 60 OR p_lease_seconds > 3600 THEN
    RAISE EXCEPTION 'INVALID_MEDIA_ASSET_LEASE_SECONDS' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_idempotency_key) NOT BETWEEN 8 AND 160 THEN
    RAISE EXCEPTION 'INVALID_MEDIA_ASSET_IDEMPOTENCY_KEY' USING ERRCODE = '22023';
  END IF;
  IF v_purpose !~ '^[a-z][a-z0-9_]{1,63}$' THEN
    RAISE EXCEPTION 'INVALID_MEDIA_ASSET_PURPOSE' USING ERRCODE = '22023';
  END IF;
  IF v_visibility NOT IN ('private', 'public') THEN
    RAISE EXCEPTION 'INVALID_MEDIA_ASSET_VISIBILITY' USING ERRCODE = '22023';
  END IF;
  IF v_storage_class NOT IN (
    'standard', 'infrequent_access', 'archive', 'cold_archive', 'deep_cold_archive'
  ) THEN
    RAISE EXCEPTION 'INVALID_MEDIA_ASSET_STORAGE_CLASS' USING ERRCODE = '22023';
  END IF;
  IF v_bucket_name !~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$' THEN
    RAISE EXCEPTION 'INVALID_MEDIA_ASSET_BUCKET_NAME' USING ERRCODE = '22023';
  END IF;
  IF octet_length(v_object_key) NOT BETWEEN 1 AND 1023
     OR position(chr(92) IN v_object_key) > 0
     OR v_object_key ~ '(^/|//|(^|/)\.{1,2}(/|$)|://|[[:cntrl:]])' THEN
    RAISE EXCEPTION 'INVALID_MEDIA_ASSET_OBJECT_KEY' USING ERRCODE = '22023';
  END IF;
  IF v_expected_sha256 IS NOT NULL AND v_expected_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'INVALID_EXPECTED_SHA256' USING ERRCODE = '22023';
  END IF;
  IF p_expected_size_bytes IS NOT NULL
     AND p_expected_size_bytes NOT BETWEEN 1 AND 5497558138880 THEN
    RAISE EXCEPTION 'INVALID_EXPECTED_MEDIA_SIZE' USING ERRCODE = '22023';
  END IF;
  IF v_expected_mime_type IS NOT NULL
     AND v_expected_mime_type !~ '^[a-z0-9][a-z0-9.+-]{0,62}/[a-z0-9][a-z0-9.+-]{0,62}$' THEN
    RAISE EXCEPTION 'INVALID_EXPECTED_MIME_TYPE' USING ERRCODE = '22023';
  END IF;
  IF (p_expected_width IS NULL) <> (p_expected_height IS NULL)
     OR p_expected_width NOT BETWEEN 1 AND 100000
     OR p_expected_height NOT BETWEEN 1 AND 100000 THEN
    RAISE EXCEPTION 'INVALID_EXPECTED_MEDIA_DIMENSIONS' USING ERRCODE = '22023';
  END IF;
  IF p_retention_until IS NOT NULL
     AND (p_retention_until <= clock_timestamp()
       OR p_retention_until > clock_timestamp() + INTERVAL '10 years') THEN
    RAISE EXCEPTION 'INVALID_MEDIA_RETENTION_UNTIL' USING ERRCODE = '22023';
  END IF;

  v_retention_policy := CASE
    WHEN p_retention_until IS NOT NULL THEN 'explicit'
    WHEN v_purpose = 'generation_result' THEN 'generated_30d'
    ELSE 'unreferenced_7d'
  END;
  v_retention_until := COALESCE(
    p_retention_until,
    clock_timestamp() + CASE
      WHEN v_purpose = 'generation_result' THEN INTERVAL '30 days'
      ELSE INTERVAL '7 days'
    END
  );

  v_fingerprint := jsonb_build_object(
    'objectKey', v_object_key,
    'purpose', v_purpose,
    'visibility', v_visibility,
    'storageClass', v_storage_class,
    'bucketName', v_bucket_name,
    'expectedSha256', v_expected_sha256,
    'expectedSizeBytes', p_expected_size_bytes,
    'expectedMimeType', v_expected_mime_type,
    'expectedWidth', p_expected_width,
    'expectedHeight', p_expected_height,
    'retentionUntil', p_retention_until,
    'retentionPolicy', v_retention_policy
  );

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_owner_user_id::TEXT || chr(0) || v_idempotency_key, 0)
  );

  SELECT asset.*
  INTO v_asset
  FROM private.media_assets AS asset
  WHERE asset.owner_user_id = p_owner_user_id
    AND asset.idempotency_key = v_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_asset.request_fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'MEDIA_ASSET_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
    END IF;

    IF v_asset.status = 'pending'
       AND v_asset.lease_expires_at <= clock_timestamp() THEN
      UPDATE private.media_assets AS asset
      SET lease_token = gen_random_uuid(),
          lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
          fence_version = asset.fence_version + 1,
          updated_at = clock_timestamp()
      WHERE asset.id = v_asset.id
      RETURNING asset.* INTO v_asset;
    END IF;

    RETURN QUERY SELECT
      v_asset.id,
      v_asset.status,
      v_asset.object_key,
      v_asset.lease_token,
      v_asset.fence_version,
      v_asset.lease_expires_at,
      true;
    RETURN;
  END IF;

  INSERT INTO private.media_assets (
    owner_user_id,
    purpose,
    visibility,
    storage_class,
    bucket_name,
    object_key,
    expected_sha256,
    expected_size_bytes,
    expected_mime_type,
    expected_width,
    expected_height,
    idempotency_key,
    request_fingerprint,
    lease_kind,
    lease_token,
    lease_expires_at,
    retention_until
  ) VALUES (
    p_owner_user_id,
    v_purpose,
    v_visibility,
    v_storage_class,
    v_bucket_name,
    v_object_key,
    v_expected_sha256,
    p_expected_size_bytes,
    v_expected_mime_type,
    p_expected_width,
    p_expected_height,
    v_idempotency_key,
    v_fingerprint,
    'upload',
    gen_random_uuid(),
    clock_timestamp() + make_interval(secs => p_lease_seconds),
    v_retention_until
  )
  RETURNING * INTO v_asset;

  RETURN QUERY SELECT
    v_asset.id,
    v_asset.status,
    v_asset.object_key,
    v_asset.lease_token,
    v_asset.fence_version,
    v_asset.lease_expires_at,
    false;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_media_asset_upload(
  p_asset_id UUID,
  p_lease_token UUID,
  p_fence_version BIGINT,
  p_sha256 TEXT,
  p_size_bytes BIGINT,
  p_mime_type TEXT,
  p_width INTEGER DEFAULT NULL,
  p_height INTEGER DEFAULT NULL
)
RETURNS TABLE(
  asset_id UUID,
  status TEXT,
  metadata_matches BOOLEAN,
  fence_version BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_role TEXT := COALESCE((SELECT auth.role()), '');
  v_sha256 TEXT := lower(btrim(COALESCE(p_sha256, '')));
  v_mime_type TEXT := lower(btrim(COALESCE(p_mime_type, '')));
  v_fingerprint JSONB;
  v_asset private.media_assets%ROWTYPE;
  v_matches BOOLEAN;
BEGIN
  IF v_actor_role <> 'service_role' THEN
    RAISE EXCEPTION 'MEDIA_ASSET_SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF v_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'INVALID_MEDIA_SHA256' USING ERRCODE = '22023';
  END IF;
  IF p_size_bytes IS NULL OR p_size_bytes NOT BETWEEN 1 AND 5497558138880 THEN
    RAISE EXCEPTION 'INVALID_MEDIA_SIZE' USING ERRCODE = '22023';
  END IF;
  IF v_mime_type !~ '^[a-z0-9][a-z0-9.+-]{0,62}/[a-z0-9][a-z0-9.+-]{0,62}$' THEN
    RAISE EXCEPTION 'INVALID_MEDIA_MIME_TYPE' USING ERRCODE = '22023';
  END IF;
  IF (p_width IS NULL) <> (p_height IS NULL)
     OR p_width NOT BETWEEN 1 AND 100000
     OR p_height NOT BETWEEN 1 AND 100000 THEN
    RAISE EXCEPTION 'INVALID_MEDIA_DIMENSIONS' USING ERRCODE = '22023';
  END IF;

  v_fingerprint := jsonb_build_object(
    'sha256', v_sha256,
    'sizeBytes', p_size_bytes,
    'mimeType', v_mime_type,
    'width', p_width,
    'height', p_height
  );

  SELECT asset.*
  INTO v_asset
  FROM private.media_assets AS asset
  WHERE asset.id = p_asset_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MEDIA_ASSET_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_asset.upload_settlement_token = p_lease_token
     AND v_asset.upload_settlement_fence_version = p_fence_version
     AND v_asset.upload_settlement_kind = 'complete' THEN
    IF v_asset.upload_settlement_fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'MEDIA_ASSET_COMPLETION_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    RETURN QUERY SELECT
      v_asset.id,
      v_asset.status,
      v_asset.status IN ('uploaded', 'verified'),
      v_asset.fence_version;
    RETURN;
  END IF;

  IF v_asset.status <> 'pending'
     OR v_asset.lease_kind <> 'upload'
     OR v_asset.lease_token IS DISTINCT FROM p_lease_token
     OR v_asset.fence_version <> p_fence_version
     OR v_asset.lease_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'STALE_MEDIA_ASSET_UPLOAD_FENCE' USING ERRCODE = '40001';
  END IF;

  v_matches :=
    (v_asset.expected_sha256 IS NULL OR v_asset.expected_sha256 = v_sha256)
    AND (v_asset.expected_size_bytes IS NULL OR v_asset.expected_size_bytes = p_size_bytes)
    AND (v_asset.expected_mime_type IS NULL OR v_asset.expected_mime_type = v_mime_type)
    AND (v_asset.expected_width IS NULL OR v_asset.expected_width = p_width)
    AND (v_asset.expected_height IS NULL OR v_asset.expected_height = p_height);

  UPDATE private.media_assets AS asset
  SET status = CASE WHEN v_matches THEN 'uploaded' ELSE 'quarantined' END,
      sha256 = v_sha256,
      size_bytes = p_size_bytes,
      mime_type = v_mime_type,
      width = p_width,
      height = p_height,
      uploaded_at = clock_timestamp(),
      quarantined_at = CASE WHEN v_matches THEN NULL ELSE clock_timestamp() END,
      last_error = CASE WHEN v_matches THEN NULL ELSE 'uploaded metadata did not match registration' END,
      lease_kind = NULL,
      lease_token = NULL,
      lease_expires_at = NULL,
      upload_settlement_token = p_lease_token,
      upload_settlement_fence_version = p_fence_version,
      upload_settlement_kind = 'complete',
      upload_settlement_fingerprint = v_fingerprint,
      fence_version = asset.fence_version + 1,
      updated_at = clock_timestamp()
  WHERE asset.id = p_asset_id
  RETURNING asset.* INTO v_asset;

  RETURN QUERY SELECT v_asset.id, v_asset.status, v_matches, v_asset.fence_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_media_asset(
  p_asset_id UUID,
  p_fence_version BIGINT
)
RETURNS TABLE(asset_id UUID, status TEXT, fence_version BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_asset private.media_assets%ROWTYPE;
BEGIN
  SELECT asset.*
  INTO v_asset
  FROM private.media_assets AS asset
  WHERE asset.id = p_asset_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MEDIA_ASSET_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_asset.mime_type LIKE 'video/%' THEN
    RAISE EXCEPTION 'MEDIA_VALIDATION_JOB_REQUIRED' USING ERRCODE = '55000';
  END IF;
  IF v_asset.status = 'verified'
     AND v_asset.verified_from_fence_version = p_fence_version THEN
    RETURN QUERY SELECT v_asset.id, v_asset.status, v_asset.fence_version;
    RETURN;
  END IF;
  IF v_asset.status <> 'uploaded' OR v_asset.fence_version <> p_fence_version THEN
    RAISE EXCEPTION 'STALE_MEDIA_ASSET_VERIFY_FENCE' USING ERRCODE = '40001';
  END IF;

  UPDATE private.media_assets AS asset
  SET status = 'verified',
      checksum_verified_at = clock_timestamp(),
      verified_at = clock_timestamp(),
      verified_from_fence_version = p_fence_version,
      fence_version = asset.fence_version + 1,
      last_error = NULL,
      updated_at = clock_timestamp()
  WHERE asset.id = p_asset_id
  RETURNING asset.* INTO v_asset;

  RETURN QUERY SELECT v_asset.id, v_asset.status, v_asset.fence_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_media_asset_upload(
  p_asset_id UUID,
  p_lease_token UUID,
  p_fence_version BIGINT,
  p_error TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_role TEXT := COALESCE((SELECT auth.role()), '');
  v_error TEXT := left(btrim(COALESCE(p_error, 'upload failed')), 2000);
  v_fingerprint JSONB := jsonb_build_object('error', left(btrim(COALESCE(p_error, 'upload failed')), 2000));
  v_asset private.media_assets%ROWTYPE;
BEGIN
  IF v_actor_role <> 'service_role' THEN
    RAISE EXCEPTION 'MEDIA_ASSET_SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  SELECT asset.*
  INTO v_asset
  FROM private.media_assets AS asset
  WHERE asset.id = p_asset_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MEDIA_ASSET_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_asset.upload_settlement_token = p_lease_token
     AND v_asset.upload_settlement_fence_version = p_fence_version
     AND v_asset.upload_settlement_kind = 'fail' THEN
    IF v_asset.upload_settlement_fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'MEDIA_ASSET_FAILURE_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    RETURN true;
  END IF;
  IF v_asset.status <> 'pending'
     OR v_asset.lease_kind <> 'upload'
     OR v_asset.lease_token IS DISTINCT FROM p_lease_token
     OR v_asset.fence_version <> p_fence_version
     OR v_asset.lease_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'STALE_MEDIA_ASSET_UPLOAD_FENCE' USING ERRCODE = '40001';
  END IF;

  UPDATE private.media_assets AS asset
  SET status = 'quarantined',
      quarantined_at = clock_timestamp(),
      last_error = v_error,
      lease_kind = NULL,
      lease_token = NULL,
      lease_expires_at = NULL,
      upload_settlement_token = p_lease_token,
      upload_settlement_fence_version = p_fence_version,
      upload_settlement_kind = 'fail',
      upload_settlement_fingerprint = v_fingerprint,
      fence_version = asset.fence_version + 1,
      updated_at = clock_timestamp()
  WHERE asset.id = p_asset_id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_media_validation_jobs(
  p_limit INTEGER DEFAULT 20,
  p_lease_seconds INTEGER DEFAULT 120,
  p_worker_id TEXT DEFAULT 'media-validator'
)
RETURNS TABLE(
  job_id UUID,
  asset_id UUID,
  owner_user_id UUID,
  object_key TEXT,
  bucket_name TEXT,
  expected_sha256 TEXT,
  expected_size_bytes BIGINT,
  expected_mime_type TEXT,
  asset_fence_version BIGINT,
  lease_token UUID,
  lease_version BIGINT,
  attempts INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_worker_id TEXT := btrim(COALESCE(p_worker_id, ''));
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 200 THEN
    RAISE EXCEPTION 'INVALID_MEDIA_VALIDATION_CLAIM_LIMIT' USING ERRCODE = '22023';
  END IF;
  IF p_lease_seconds IS NULL OR p_lease_seconds < 30 OR p_lease_seconds > 900 THEN
    RAISE EXCEPTION 'INVALID_MEDIA_VALIDATION_LEASE_SECONDS' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_worker_id) NOT BETWEEN 3 AND 128 THEN
    RAISE EXCEPTION 'INVALID_MEDIA_VALIDATION_WORKER_ID' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT job.id
    FROM private.media_validation_jobs AS job
    JOIN private.media_assets AS asset
      ON asset.id = job.media_asset_id
    WHERE job.status = 'pending'
      AND job.available_at <= clock_timestamp()
      AND job.attempts < job.max_attempts
      AND asset.status = 'uploaded'
      AND asset.fence_version = job.asset_fence_version
    ORDER BY job.available_at, job.created_at, job.id
    FOR UPDATE OF job SKIP LOCKED
    LIMIT p_limit
  ),
  claimed AS (
    UPDATE private.media_validation_jobs AS job
    SET status = 'processing',
        attempts = job.attempts + 1,
        lease_token = gen_random_uuid(),
        lease_version = job.lease_version + 1,
        lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
        claimed_by = v_worker_id,
        last_error = NULL,
        updated_at = clock_timestamp()
    FROM candidates
    WHERE job.id = candidates.id
    RETURNING job.*
  )
  SELECT
    claimed.id,
    asset.id,
    claimed.owner_user_id,
    asset.object_key,
    asset.bucket_name,
    asset.sha256,
    asset.size_bytes,
    asset.mime_type,
    claimed.asset_fence_version,
    claimed.lease_token,
    claimed.lease_version,
    claimed.attempts
  FROM claimed
  JOIN private.media_assets AS asset
    ON asset.id = claimed.media_asset_id
  ORDER BY claimed.available_at, claimed.created_at, claimed.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.heartbeat_media_validation_job(
  p_job_id UUID,
  p_lease_token UUID,
  p_lease_version BIGINT,
  p_lease_seconds INTEGER DEFAULT 120
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_lease_seconds IS NULL OR p_lease_seconds < 30 OR p_lease_seconds > 900 THEN
    RAISE EXCEPTION 'INVALID_MEDIA_VALIDATION_LEASE_SECONDS' USING ERRCODE = '22023';
  END IF;

  UPDATE private.media_validation_jobs AS job
  SET lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
      updated_at = clock_timestamp()
  WHERE job.id = p_job_id
    AND job.status = 'processing'
    AND job.lease_token = p_lease_token
    AND job.lease_version = p_lease_version
    AND job.lease_expires_at > clock_timestamp();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'STALE_MEDIA_VALIDATION_FENCE' USING ERRCODE = '40001';
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_media_validation_job(
  p_job_id UUID,
  p_lease_token UUID,
  p_lease_version BIGINT,
  p_observed_sha256 TEXT,
  p_observed_size_bytes BIGINT,
  p_observed_mime_type TEXT,
  p_width INTEGER,
  p_height INTEGER,
  p_duration_ms BIGINT,
  p_validation_result JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE(
  job_id UUID,
  job_status TEXT,
  asset_status TEXT,
  asset_fence_version BIGINT,
  metadata_matches BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sha256 TEXT := lower(btrim(COALESCE(p_observed_sha256, '')));
  v_mime_type TEXT := lower(btrim(COALESCE(p_observed_mime_type, '')));
  v_result JSONB := COALESCE(p_validation_result, '{}'::jsonb);
  v_fingerprint JSONB;
  v_job private.media_validation_jobs%ROWTYPE;
  v_asset private.media_assets%ROWTYPE;
  v_matches BOOLEAN;
BEGIN
  IF v_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'INVALID_MEDIA_VALIDATION_SHA256' USING ERRCODE = '22023';
  END IF;
  IF p_observed_size_bytes IS NULL
     OR p_observed_size_bytes NOT BETWEEN 1 AND 5497558138880 THEN
    RAISE EXCEPTION 'INVALID_MEDIA_VALIDATION_SIZE' USING ERRCODE = '22023';
  END IF;
  IF v_mime_type !~ '^[a-z0-9][a-z0-9.+-]{0,62}/[a-z0-9][a-z0-9.+-]{0,62}$' THEN
    RAISE EXCEPTION 'INVALID_MEDIA_VALIDATION_MIME_TYPE' USING ERRCODE = '22023';
  END IF;
  IF p_width IS NULL OR p_width NOT BETWEEN 1 AND 100000
     OR p_height IS NULL OR p_height NOT BETWEEN 1 AND 100000 THEN
    RAISE EXCEPTION 'INVALID_MEDIA_VALIDATION_DIMENSIONS' USING ERRCODE = '22023';
  END IF;
  IF p_duration_ms IS NULL OR p_duration_ms NOT BETWEEN 1 AND 86400000 THEN
    RAISE EXCEPTION 'INVALID_MEDIA_VALIDATION_DURATION' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(v_result) <> 'object' OR octet_length(v_result::TEXT) > 16384 THEN
    RAISE EXCEPTION 'INVALID_MEDIA_VALIDATION_RESULT' USING ERRCODE = '22023';
  END IF;

  v_fingerprint := jsonb_build_object(
    'sha256', v_sha256,
    'sizeBytes', p_observed_size_bytes,
    'mimeType', v_mime_type,
    'width', p_width,
    'height', p_height,
    'durationMs', p_duration_ms,
    'result', v_result
  );

  SELECT job.*
  INTO v_job
  FROM private.media_validation_jobs AS job
  WHERE job.id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MEDIA_VALIDATION_JOB_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_job.status = 'completed'
     AND v_job.settlement_token = p_lease_token
     AND v_job.settlement_lease_version = p_lease_version THEN
    IF v_job.settlement_fingerprint <> v_fingerprint THEN
      RAISE EXCEPTION 'MEDIA_VALIDATION_COMPLETION_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    SELECT asset.*
    INTO v_asset
    FROM private.media_assets AS asset
    WHERE asset.id = v_job.media_asset_id;
    RETURN QUERY SELECT
      v_job.id,
      v_job.status,
      v_asset.status,
      v_asset.fence_version,
      v_job.validation_outcome = 'verified';
    RETURN;
  END IF;
  IF v_job.status <> 'processing'
     OR v_job.lease_token IS DISTINCT FROM p_lease_token
     OR v_job.lease_version <> p_lease_version
     OR v_job.lease_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'STALE_MEDIA_VALIDATION_FENCE' USING ERRCODE = '40001';
  END IF;

  SELECT asset.*
  INTO v_asset
  FROM private.media_assets AS asset
  WHERE asset.id = v_job.media_asset_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_asset.status <> 'uploaded'
     OR v_asset.fence_version <> v_job.asset_fence_version THEN
    RAISE EXCEPTION 'STALE_MEDIA_ASSET_VALIDATION_FENCE' USING ERRCODE = '40001';
  END IF;

  v_matches := v_asset.sha256 = v_sha256
    AND v_asset.size_bytes = p_observed_size_bytes
    AND v_asset.mime_type = v_mime_type
    AND (v_asset.expected_width IS NULL OR v_asset.expected_width = p_width)
    AND (v_asset.expected_height IS NULL OR v_asset.expected_height = p_height);

  UPDATE private.media_assets AS asset
  SET status = CASE WHEN v_matches THEN 'verified' ELSE 'quarantined' END,
      sha256 = v_sha256,
      size_bytes = p_observed_size_bytes,
      mime_type = v_mime_type,
      width = p_width,
      height = p_height,
      duration_ms = p_duration_ms,
      checksum_verified_at = CASE WHEN v_matches THEN clock_timestamp() ELSE NULL END,
      verified_at = CASE WHEN v_matches THEN clock_timestamp() ELSE NULL END,
      verified_from_fence_version = CASE
        WHEN v_matches THEN v_job.asset_fence_version
        ELSE asset.verified_from_fence_version
      END,
      quarantined_at = CASE WHEN v_matches THEN NULL ELSE clock_timestamp() END,
      last_error = CASE
        WHEN v_matches THEN NULL
        ELSE 'full media validation did not match uploaded metadata'
      END,
      fence_version = asset.fence_version + 1,
      updated_at = clock_timestamp()
  WHERE asset.id = v_job.media_asset_id
  RETURNING asset.* INTO v_asset;

  UPDATE private.media_validation_jobs AS job
  SET status = 'completed',
      lease_token = NULL,
      lease_expires_at = NULL,
      last_worker_id = job.claimed_by,
      claimed_by = NULL,
      validation_outcome = CASE WHEN v_matches THEN 'verified' ELSE 'quarantined' END,
      validation_result = v_result,
      settlement_token = p_lease_token,
      settlement_lease_version = p_lease_version,
      settlement_fingerprint = v_fingerprint,
      completed_at = clock_timestamp(),
      dead_at = NULL,
      last_error = CASE WHEN v_matches THEN NULL ELSE 'metadata mismatch' END,
      updated_at = clock_timestamp()
  WHERE job.id = p_job_id
  RETURNING job.* INTO v_job;

  RETURN QUERY SELECT
    v_job.id,
    v_job.status,
    v_asset.status,
    v_asset.fence_version,
    v_matches;
END;
$$;

CREATE OR REPLACE FUNCTION public.defer_media_validation_job(
  p_job_id UUID,
  p_lease_token UUID,
  p_lease_version BIGINT,
  p_error TEXT,
  p_retryable BOOLEAN DEFAULT true,
  p_delay_seconds INTEGER DEFAULT 60
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_job private.media_validation_jobs%ROWTYPE;
  v_status TEXT;
BEGIN
  IF p_retryable IS NULL THEN
    RAISE EXCEPTION 'MEDIA_VALIDATION_RETRYABLE_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF p_delay_seconds IS NULL OR p_delay_seconds < 1 OR p_delay_seconds > 86400 THEN
    RAISE EXCEPTION 'INVALID_MEDIA_VALIDATION_DELAY_SECONDS' USING ERRCODE = '22023';
  END IF;

  SELECT job.*
  INTO v_job
  FROM private.media_validation_jobs AS job
  WHERE job.id = p_job_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MEDIA_VALIDATION_JOB_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_job.status <> 'processing'
     OR v_job.lease_token IS DISTINCT FROM p_lease_token
     OR v_job.lease_version <> p_lease_version
     OR v_job.lease_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'STALE_MEDIA_VALIDATION_FENCE' USING ERRCODE = '40001';
  END IF;

  v_status := CASE
    WHEN p_retryable AND v_job.attempts < v_job.max_attempts THEN 'pending'
    ELSE 'dead'
  END;

  UPDATE private.media_validation_jobs AS job
  SET status = v_status,
      available_at = CASE
        WHEN v_status = 'pending'
          THEN clock_timestamp() + make_interval(secs => p_delay_seconds)
        ELSE job.available_at
      END,
      lease_token = NULL,
      lease_expires_at = NULL,
      last_worker_id = job.claimed_by,
      claimed_by = NULL,
      last_error = left(btrim(COALESCE(p_error, 'validation failed')), 2000),
      dead_at = CASE WHEN v_status = 'dead' THEN clock_timestamp() ELSE NULL END,
      updated_at = clock_timestamp()
  WHERE job.id = p_job_id;

  IF v_status = 'dead' THEN
    UPDATE private.media_assets AS asset
    SET status = 'quarantined',
        quarantined_at = clock_timestamp(),
        last_error = left(btrim(COALESCE(p_error, 'media validation exhausted')), 2000),
        fence_version = asset.fence_version + 1,
        updated_at = clock_timestamp()
    WHERE asset.id = v_job.media_asset_id
      AND asset.status = 'uploaded'
      AND asset.fence_version = v_job.asset_fence_version;
  END IF;

  RETURN v_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.recover_media_validation_jobs(
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE(
  recovered_leases INTEGER,
  repaired_missing INTEGER,
  dead_lettered INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_recovered INTEGER := 0;
  v_repaired INTEGER := 0;
  v_dead INTEGER := 0;
  v_count INTEGER := 0;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'INVALID_MEDIA_VALIDATION_RECOVER_LIMIT' USING ERRCODE = '22023';
  END IF;

  WITH stale AS (
    SELECT job.id
    FROM private.media_validation_jobs AS job
    JOIN private.media_assets AS asset ON asset.id = job.media_asset_id
    WHERE job.status = 'processing'
      AND job.lease_expires_at <= clock_timestamp()
      AND job.attempts < job.max_attempts
      AND asset.status = 'uploaded'
      AND asset.fence_version = job.asset_fence_version
    ORDER BY job.lease_expires_at, job.created_at, job.id
    FOR UPDATE OF job SKIP LOCKED
    LIMIT p_limit
  )
  UPDATE private.media_validation_jobs AS job
  SET status = 'pending',
      available_at = clock_timestamp(),
      lease_token = NULL,
      lease_expires_at = NULL,
      last_worker_id = job.claimed_by,
      claimed_by = NULL,
      last_error = 'recovery: validation lease expired',
      updated_at = clock_timestamp()
  FROM stale
  WHERE job.id = stale.id;
  GET DIAGNOSTICS v_recovered = ROW_COUNT;

  WITH invalid AS (
    SELECT job.id
    FROM private.media_validation_jobs AS job
    JOIN private.media_assets AS asset ON asset.id = job.media_asset_id
    WHERE job.status IN ('pending', 'processing')
      AND (
        job.attempts >= job.max_attempts
        OR asset.status <> 'uploaded'
        OR asset.fence_version <> job.asset_fence_version
      )
    ORDER BY job.updated_at, job.id
    FOR UPDATE OF job SKIP LOCKED
    LIMIT p_limit
  ),
  dead_jobs AS (
    UPDATE private.media_validation_jobs AS job
    SET status = 'dead',
        lease_token = NULL,
        lease_expires_at = NULL,
        last_worker_id = COALESCE(job.claimed_by, job.last_worker_id),
        claimed_by = NULL,
        dead_at = clock_timestamp(),
        last_error = CASE
          WHEN job.attempts >= job.max_attempts THEN 'recovery: maximum attempts exhausted'
          ELSE 'recovery: media asset fence or status changed'
        END,
        updated_at = clock_timestamp()
    FROM invalid
    WHERE job.id = invalid.id
    RETURNING job.media_asset_id, job.asset_fence_version, job.last_error
  ),
  quarantined AS (
    UPDATE private.media_assets AS asset
    SET status = 'quarantined',
        quarantined_at = clock_timestamp(),
        last_error = dead_jobs.last_error,
        fence_version = asset.fence_version + 1,
        updated_at = clock_timestamp()
    FROM dead_jobs
    WHERE asset.id = dead_jobs.media_asset_id
      AND asset.status = 'uploaded'
      AND asset.fence_version = dead_jobs.asset_fence_version
    RETURNING asset.id
  )
  SELECT count(*)::INTEGER INTO v_count FROM dead_jobs;
  v_dead := v_dead + v_count;

  WITH missing AS (
    SELECT asset.id, asset.owner_user_id, asset.fence_version
    FROM private.media_assets AS asset
    WHERE asset.status = 'uploaded'
      AND asset.mime_type LIKE 'video/%'
      AND NOT EXISTS (
        SELECT 1
        FROM private.media_validation_jobs AS job
        WHERE job.media_asset_id = asset.id
      )
    ORDER BY asset.uploaded_at, asset.created_at, asset.id
    FOR UPDATE OF asset SKIP LOCKED
    LIMIT p_limit
  )
  INSERT INTO private.media_validation_jobs (
    media_asset_id,
    owner_user_id,
    media_kind,
    asset_fence_version,
    available_at
  )
  SELECT missing.id, missing.owner_user_id, 'video', missing.fence_version, clock_timestamp()
  FROM missing
  ON CONFLICT (media_asset_id) DO NOTHING;
  GET DIAGNOSTICS v_repaired = ROW_COUNT;

  RETURN QUERY SELECT v_recovered, v_repaired, v_dead;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_media_validation_queue_health()
RETURNS TABLE(
  pending_count BIGINT,
  processing_count BIGINT,
  completed_count BIGINT,
  dead_count BIGINT,
  stale_processing_count BIGINT,
  uploaded_without_job_count BIGINT,
  oldest_pending_age_seconds BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH job_counts AS (
    SELECT
      count(*) FILTER (WHERE job.status = 'pending') AS pending_count,
      count(*) FILTER (WHERE job.status = 'processing') AS processing_count,
      count(*) FILTER (WHERE job.status = 'completed') AS completed_count,
      count(*) FILTER (WHERE job.status = 'dead') AS dead_count,
      count(*) FILTER (
        WHERE job.status = 'processing' AND job.lease_expires_at <= now()
      ) AS stale_processing_count,
      COALESCE(FLOOR(EXTRACT(EPOCH FROM (
        now() - min(job.created_at) FILTER (WHERE job.status = 'pending')
      )))::BIGINT, 0) AS oldest_pending_age_seconds
    FROM private.media_validation_jobs AS job
  ),
  missing AS (
    SELECT count(*) AS uploaded_without_job_count
    FROM private.media_assets AS asset
    WHERE asset.status = 'uploaded'
      AND asset.mime_type LIKE 'video/%'
      AND NOT EXISTS (
        SELECT 1
        FROM private.media_validation_jobs AS job
        WHERE job.media_asset_id = asset.id
      )
  )
  SELECT
    job_counts.pending_count,
    job_counts.processing_count,
    job_counts.completed_count,
    job_counts.dead_count,
    job_counts.stale_processing_count,
    missing.uploaded_without_job_count,
    job_counts.oldest_pending_age_seconds
  FROM job_counts CROSS JOIN missing;
$$;

CREATE OR REPLACE FUNCTION public.claim_media_asset_cleanup(
  p_limit INTEGER DEFAULT 50,
  p_lease_seconds INTEGER DEFAULT 300
)
RETURNS TABLE(
  asset_id UUID,
  object_key TEXT,
  bucket_name TEXT,
  storage_class TEXT,
  cleanup_token UUID,
  fence_version BIGINT,
  lease_expires_at TIMESTAMPTZ,
  cleanup_attempts INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500 THEN
    RAISE EXCEPTION 'INVALID_MEDIA_CLEANUP_LIMIT' USING ERRCODE = '22023';
  END IF;
  IF p_lease_seconds IS NULL OR p_lease_seconds < 30 OR p_lease_seconds > 1800 THEN
    RAISE EXCEPTION 'INVALID_MEDIA_CLEANUP_LEASE_SECONDS' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT asset.id
    FROM private.media_assets AS asset
    WHERE asset.status <> 'deleted'
      AND asset.legal_hold = false
      AND asset.retention_until IS NOT NULL
      AND asset.retention_until <= clock_timestamp()
      AND (asset.lease_token IS NULL OR asset.lease_expires_at <= clock_timestamp())
      AND NOT private.media_asset_has_active_reference(asset.id)
    ORDER BY asset.retention_until, asset.created_at, asset.id
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  ),
  claimed AS (
    UPDATE private.media_assets AS asset
    SET lease_kind = 'cleanup',
        lease_token = gen_random_uuid(),
        lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
        fence_version = asset.fence_version + 1,
        cleanup_attempts = asset.cleanup_attempts + 1,
        cleanup_settlement_token = NULL,
        cleanup_settlement_fence_version = NULL,
        cleanup_settlement_kind = NULL,
        -- Authorization is a one-way delete linearization point. Preserve it
        -- across an expired-lease reclaim so an ambiguous OSS DELETE/confirm
        -- response can only be retried, never reopened to a new legal hold.
        cleanup_authorized_at = asset.cleanup_authorized_at,
        updated_at = clock_timestamp()
    FROM candidates
    WHERE asset.id = candidates.id
    RETURNING asset.*
  )
  SELECT
    claimed.id,
    claimed.object_key,
    claimed.bucket_name,
    claimed.storage_class,
    claimed.lease_token,
    claimed.fence_version,
    claimed.lease_expires_at,
    claimed.cleanup_attempts
  FROM claimed
  ORDER BY claimed.retention_until, claimed.created_at, claimed.id;
END;
$$;

-- This short second phase is intentionally required immediately before the
-- external OSS DELETE. The committed cleanup_authorized_at write is the
-- irreversible delete linearization point: reference creation is already
-- blocked by the cleanup lease, and legal-hold enablement must fail/retry after
-- this point. The marker survives lease recovery until confirm settles deleted.
CREATE OR REPLACE FUNCTION public.authorize_media_asset_cleanup(
  p_asset_id UUID,
  p_cleanup_token UUID,
  p_fence_version BIGINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_asset private.media_assets%ROWTYPE;
BEGIN
  SELECT asset.*
  INTO v_asset
  FROM private.media_assets AS asset
  WHERE asset.id = p_asset_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MEDIA_ASSET_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_asset.status = 'deleted'
     OR v_asset.lease_kind <> 'cleanup'
     OR v_asset.lease_token IS DISTINCT FROM p_cleanup_token
     OR v_asset.fence_version <> p_fence_version
     OR v_asset.lease_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'STALE_MEDIA_ASSET_CLEANUP_FENCE' USING ERRCODE = '40001';
  END IF;
  IF v_asset.legal_hold OR private.media_asset_has_active_reference(v_asset.id) THEN
    RAISE EXCEPTION 'MEDIA_ASSET_CLEANUP_BLOCKED' USING ERRCODE = '55000';
  END IF;
  -- This write is the irreversible delete linearization point. Later legal
  -- holds must fail instead of invalidating the fence after OSS may be deleted.
  IF v_asset.cleanup_authorized_at IS NULL THEN
    UPDATE private.media_assets AS asset
    SET cleanup_authorized_at = clock_timestamp(),
        updated_at = clock_timestamp()
    WHERE asset.id = p_asset_id;
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_media_asset_cleanup(
  p_asset_id UUID,
  p_cleanup_token UUID,
  p_fence_version BIGINT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_asset private.media_assets%ROWTYPE;
BEGIN
  SELECT asset.*
  INTO v_asset
  FROM private.media_assets AS asset
  WHERE asset.id = p_asset_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MEDIA_ASSET_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_asset.status = 'deleted'
     AND v_asset.cleanup_settlement_token = p_cleanup_token
     AND v_asset.cleanup_settlement_fence_version = p_fence_version
     AND v_asset.cleanup_settlement_kind = 'confirm' THEN
    RETURN true;
  END IF;
  IF v_asset.status = 'deleted'
     OR v_asset.lease_kind <> 'cleanup'
     OR v_asset.lease_token IS DISTINCT FROM p_cleanup_token
     OR v_asset.fence_version <> p_fence_version
     OR v_asset.lease_expires_at <= clock_timestamp()
     OR v_asset.cleanup_authorized_at IS NULL THEN
    RAISE EXCEPTION 'STALE_MEDIA_ASSET_CLEANUP_FENCE' USING ERRCODE = '40001';
  END IF;
  IF v_asset.legal_hold OR private.media_asset_has_active_reference(v_asset.id) THEN
    RAISE EXCEPTION 'MEDIA_ASSET_CLEANUP_BLOCKED' USING ERRCODE = '55000';
  END IF;

  UPDATE private.media_assets AS asset
  SET status = 'deleted',
      deleted_at = clock_timestamp(),
      lease_kind = NULL,
      lease_token = NULL,
      lease_expires_at = NULL,
      cleanup_authorized_at = NULL,
      cleanup_settlement_token = p_cleanup_token,
      cleanup_settlement_fence_version = p_fence_version,
      cleanup_settlement_kind = 'confirm',
      fence_version = asset.fence_version + 1,
      last_error = NULL,
      updated_at = clock_timestamp()
  WHERE asset.id = p_asset_id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.nack_media_asset_cleanup(
  p_asset_id UUID,
  p_cleanup_token UUID,
  p_fence_version BIGINT,
  p_error TEXT,
  p_delay_seconds INTEGER DEFAULT 300
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_asset private.media_assets%ROWTYPE;
BEGIN
  IF p_delay_seconds IS NULL OR p_delay_seconds < 1 OR p_delay_seconds > 86400 THEN
    RAISE EXCEPTION 'INVALID_MEDIA_CLEANUP_DELAY_SECONDS' USING ERRCODE = '22023';
  END IF;

  SELECT asset.*
  INTO v_asset
  FROM private.media_assets AS asset
  WHERE asset.id = p_asset_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MEDIA_ASSET_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_asset.cleanup_settlement_token = p_cleanup_token
     AND v_asset.cleanup_settlement_fence_version = p_fence_version
     AND v_asset.cleanup_settlement_kind = 'nack' THEN
    RETURN true;
  END IF;
  IF v_asset.status = 'deleted'
     OR v_asset.lease_kind <> 'cleanup'
     OR v_asset.lease_token IS DISTINCT FROM p_cleanup_token
     OR v_asset.fence_version <> p_fence_version
     OR v_asset.lease_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'STALE_MEDIA_ASSET_CLEANUP_FENCE' USING ERRCODE = '40001';
  END IF;

  -- Before authorization, nack releases the claim normally. After
  -- authorization, an OSS DELETE may already have succeeded even when its
  -- response or database confirm was lost. Keep the cleanup lease and durable
  -- authorization marker, delay its expiry, and force an idempotent retry.
  UPDATE private.media_assets AS asset
  SET lease_kind = CASE
        WHEN asset.cleanup_authorized_at IS NULL THEN NULL
        ELSE 'cleanup'
      END,
      lease_token = CASE
        WHEN asset.cleanup_authorized_at IS NULL THEN NULL
        ELSE asset.lease_token
      END,
      lease_expires_at = CASE
        WHEN asset.cleanup_authorized_at IS NULL THEN NULL
        ELSE clock_timestamp() + make_interval(secs => p_delay_seconds)
      END,
      cleanup_authorized_at = asset.cleanup_authorized_at,
      retention_until = clock_timestamp() + make_interval(secs => p_delay_seconds),
      cleanup_settlement_token = p_cleanup_token,
      cleanup_settlement_fence_version = p_fence_version,
      cleanup_settlement_kind = 'nack',
      last_error = left(btrim(COALESCE(p_error, 'cleanup failed')), 2000),
      updated_at = clock_timestamp()
  WHERE asset.id = p_asset_id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_media_asset_legal_hold(
  p_asset_id UUID,
  p_legal_hold BOOLEAN,
  p_reason TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_fence_version BIGINT;
  v_cleanup_authorized_at TIMESTAMPTZ;
BEGIN
  IF p_legal_hold IS NULL THEN
    RAISE EXCEPTION 'LEGAL_HOLD_VALUE_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF p_legal_hold AND char_length(btrim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'LEGAL_HOLD_REASON_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT asset.cleanup_authorized_at
  INTO v_cleanup_authorized_at
  FROM private.media_assets AS asset
  WHERE asset.id = p_asset_id
    AND asset.status <> 'deleted'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MEDIA_ASSET_NOT_FOUND_OR_DELETED' USING ERRCODE = 'P0002';
  END IF;
  -- If authorization committed first, OSS deletion is already logically
  -- ordered before this hold and may have physically completed. Never clear
  -- that fence: the caller must retry after cleanup reaches terminal state.
  IF p_legal_hold AND v_cleanup_authorized_at IS NOT NULL THEN
    RAISE EXCEPTION 'MEDIA_ASSET_DELETE_ALREADY_AUTHORIZED' USING ERRCODE = '55000';
  END IF;

  UPDATE private.media_assets AS asset
  SET legal_hold = p_legal_hold,
      legal_hold_reason = CASE
        WHEN p_legal_hold THEN left(btrim(p_reason), 500)
        ELSE NULL
      END,
      lease_kind = CASE WHEN p_legal_hold AND asset.lease_kind = 'cleanup' THEN NULL ELSE asset.lease_kind END,
      lease_token = CASE WHEN p_legal_hold AND asset.lease_kind = 'cleanup' THEN NULL ELSE asset.lease_token END,
      lease_expires_at = CASE WHEN p_legal_hold AND asset.lease_kind = 'cleanup' THEN NULL ELSE asset.lease_expires_at END,
      cleanup_authorized_at = CASE
        WHEN p_legal_hold AND asset.lease_kind = 'cleanup' THEN NULL
        ELSE asset.cleanup_authorized_at
      END,
      fence_version = CASE
        WHEN p_legal_hold AND asset.lease_kind = 'cleanup' THEN asset.fence_version + 1
        ELSE asset.fence_version
      END,
      updated_at = clock_timestamp()
  WHERE asset.id = p_asset_id
    AND asset.status <> 'deleted'
  RETURNING asset.fence_version INTO v_fence_version;

  RETURN v_fence_version;
END;
$$;

CREATE OR REPLACE FUNCTION public.attach_media_asset_reference(
  p_asset_id UUID,
  p_owner_user_id UUID,
  p_subject_type TEXT,
  p_subject_id UUID,
  p_asset_role TEXT,
  p_ordinal INTEGER DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_link_id UUID;
  v_asset private.media_assets%ROWTYPE;
BEGIN
  IF p_subject_type !~ '^[a-z][a-z0-9_]{1,63}$'
     OR p_asset_role !~ '^[a-z][a-z0-9_]{1,63}$'
     OR p_subject_id IS NULL
     OR p_ordinal NOT BETWEEN 0 AND 10000 THEN
    RAISE EXCEPTION 'INVALID_MEDIA_ASSET_REFERENCE' USING ERRCODE = '22023';
  END IF;
  SELECT asset.*
  INTO v_asset
  FROM private.media_assets AS asset
  WHERE asset.id = p_asset_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_asset.owner_user_id <> p_owner_user_id
     OR v_asset.status <> 'verified'
     OR v_asset.lease_kind = 'cleanup' THEN
    RAISE EXCEPTION 'MEDIA_ASSET_NOT_VERIFIED_OR_OWNER_MISMATCH' USING ERRCODE = '55000';
  END IF;

  INSERT INTO private.media_asset_links (
    media_asset_id,
    owner_user_id,
    subject_type,
    subject_id,
    asset_role,
    ordinal
  ) VALUES (
    p_asset_id,
    p_owner_user_id,
    lower(p_subject_type),
    p_subject_id,
    lower(p_asset_role),
    p_ordinal
  )
  ON CONFLICT (subject_type, subject_id, asset_role, ordinal) DO UPDATE
  SET media_asset_id = EXCLUDED.media_asset_id,
      owner_user_id = EXCLUDED.owner_user_id
  RETURNING id INTO v_link_id;

  RETURN v_link_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.detach_media_asset_reference(
  p_subject_type TEXT,
  p_subject_id UUID,
  p_asset_role TEXT,
  p_ordinal INTEGER DEFAULT 0
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH deleted AS (
    DELETE FROM private.media_asset_links AS link
    WHERE link.subject_type = lower(p_subject_type)
      AND link.subject_id = p_subject_id
      AND link.asset_role = lower(p_asset_role)
      AND link.ordinal = p_ordinal
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM deleted);
$$;

CREATE OR REPLACE FUNCTION private.detach_generation_media_asset_links()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM private.media_asset_links AS link
  WHERE link.subject_type = 'generation'
    AND link.subject_id = OLD.id;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION private.detach_generation_media_asset_links()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER generations_detach_media_asset_links
AFTER DELETE ON public.generations
FOR EACH ROW EXECUTE FUNCTION private.detach_generation_media_asset_links();

CREATE OR REPLACE FUNCTION public.resolve_media_asset_object(p_asset_id UUID)
RETURNS TABLE(
  asset_id UUID,
  object_key TEXT,
  visibility TEXT,
  status TEXT,
  mime_type TEXT,
  size_bytes BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id UUID := (SELECT auth.uid());
  v_actor_role TEXT := COALESCE((SELECT auth.role()), '');
BEGIN
  RETURN QUERY
  SELECT
    asset.id,
    asset.object_key,
    asset.visibility,
    asset.status,
    asset.mime_type,
    asset.size_bytes
  FROM private.media_assets AS asset
  WHERE asset.id = p_asset_id
    AND asset.status = 'verified'
    AND (
      asset.visibility = 'public'
      OR asset.owner_user_id = v_actor_id
      OR v_actor_role = 'service_role'
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_media_asset_status(
  p_asset_id UUID,
  p_expected_owner_user_id UUID
)
RETURNS TABLE(
  asset_id UUID,
  status TEXT,
  fence_version BIGINT,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE((SELECT auth.role()), '') <> 'service_role' THEN
    RAISE EXCEPTION 'MEDIA_ASSET_SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT asset.id, asset.status, asset.fence_version, asset.updated_at
  FROM private.media_assets AS asset
  WHERE asset.id = p_asset_id
    AND asset.owner_user_id = p_expected_owner_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MEDIA_ASSET_NOT_FOUND_OR_OWNER_MISMATCH' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_verified_media_asset_for_worker(
  p_asset_id UUID,
  p_expected_owner_user_id UUID
)
RETURNS TABLE(
  asset_id UUID,
  bucket_name TEXT,
  object_key TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  sha256 TEXT,
  purpose TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE((SELECT auth.role()), '') <> 'service_role' THEN
    RAISE EXCEPTION 'MEDIA_ASSET_SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    asset.id,
    asset.bucket_name,
    asset.object_key,
    asset.mime_type,
    asset.size_bytes,
    asset.sha256,
    asset.purpose
  FROM private.media_assets AS asset
  WHERE asset.id = p_asset_id
    AND asset.owner_user_id = p_expected_owner_user_id
    AND asset.status = 'verified';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'VERIFIED_MEDIA_ASSET_NOT_FOUND_OR_OWNER_MISMATCH' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_media_asset_lifecycle_health()
RETURNS TABLE(
  pending_count BIGINT,
  uploaded_count BIGINT,
  verified_count BIGINT,
  quarantined_count BIGINT,
  deleted_count BIGINT,
  cleanup_ready_count BIGINT,
  expired_lease_count BIGINT,
  oldest_pending_age_seconds BIGINT,
  oldest_cleanup_ready_age_seconds BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    count(*) FILTER (WHERE asset.status = 'pending'),
    count(*) FILTER (WHERE asset.status = 'uploaded'),
    count(*) FILTER (WHERE asset.status = 'verified'),
    count(*) FILTER (WHERE asset.status = 'quarantined'),
    count(*) FILTER (WHERE asset.status = 'deleted'),
    count(*) FILTER (
      WHERE asset.status <> 'deleted'
        AND asset.legal_hold = false
        AND asset.retention_until <= now()
    ),
    count(*) FILTER (
      WHERE asset.lease_token IS NOT NULL
        AND asset.lease_expires_at <= now()
    ),
    COALESCE(FLOOR(EXTRACT(EPOCH FROM (
      now() - min(asset.created_at) FILTER (WHERE asset.status = 'pending')
    )))::BIGINT, 0),
    COALESCE(FLOOR(EXTRACT(EPOCH FROM (
      now() - min(asset.retention_until) FILTER (
        WHERE asset.status <> 'deleted'
          AND asset.legal_hold = false
          AND asset.retention_until <= now()
      )
    )))::BIGINT, 0)
  FROM private.media_assets AS asset;
$$;

CREATE OR REPLACE FUNCTION private.validate_resource_library_media_asset_reference()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.media_asset_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- The key-share lock serializes publication with cleanup claim/authorization.
  -- Once cleanup is claimed, no new resource-library reference can race the
  -- external object deletion.
  PERFORM 1
  FROM private.media_assets AS asset
  WHERE asset.id = NEW.media_asset_id
    AND asset.owner_user_id = NEW.user_id
    AND asset.status = 'verified'
    AND asset.lease_kind IS DISTINCT FROM 'cleanup'
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESOURCE_LIBRARY_MEDIA_ASSET_INVALID' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.validate_resource_library_media_asset_reference()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.validate_oss_mirror_media_asset_reference()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.media_asset_id IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM 1
  FROM private.media_assets AS asset
  WHERE asset.id = NEW.media_asset_id
    AND asset.owner_user_id = NEW.owner_user_id
    AND asset.object_key = NEW.object_key
    AND asset.status = 'verified'
    AND asset.lease_kind IS DISTINCT FROM 'cleanup'
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OSS_MIRROR_MEDIA_ASSET_INVALID' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.validate_oss_mirror_media_asset_reference()
  FROM PUBLIC, anon, authenticated, service_role;

-- Existing resource library deployments can adopt the registry without
-- keeping legacy URL rows in the private control plane. The column is nullable
-- so migration order is safe; new application writes should require it.
DO $migration$
BEGIN
  IF to_regclass('public.resource_library_assets') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute AS attribute
      WHERE attribute.attrelid = 'public.resource_library_assets'::regclass
        AND attribute.attname = 'id'
        AND NOT attribute.attisdropped
    ) AND EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute AS attribute
      WHERE attribute.attrelid = 'public.resource_library_assets'::regclass
        AND attribute.attname = 'user_id'
        AND NOT attribute.attisdropped
    ) THEN
      ALTER TABLE public.resource_library_assets
        ADD COLUMN IF NOT EXISTS media_asset_id UUID;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint AS constraint_row
        WHERE constraint_row.conname = 'resource_library_assets_media_asset_id_fkey'
          AND constraint_row.conrelid = 'public.resource_library_assets'::regclass
      ) THEN
        ALTER TABLE public.resource_library_assets
          ADD CONSTRAINT resource_library_assets_media_asset_id_fkey
          FOREIGN KEY (media_asset_id)
          REFERENCES private.media_assets(id)
          ON DELETE RESTRICT;
      END IF;

      CREATE INDEX IF NOT EXISTS resource_library_assets_media_asset_id_idx
        ON public.resource_library_assets (media_asset_id)
        WHERE media_asset_id IS NOT NULL;

      DROP TRIGGER IF EXISTS resource_library_assets_validate_media_asset
        ON public.resource_library_assets;
      CREATE TRIGGER resource_library_assets_validate_media_asset
        BEFORE INSERT OR UPDATE
        ON public.resource_library_assets
        FOR EACH ROW
        EXECUTE FUNCTION private.validate_resource_library_media_asset_reference();
    ELSE
      RAISE NOTICE 'resource_library_assets lacks id/user_id; media registry link was not installed';
    END IF;
  END IF;
END;
$migration$;

-- The mirror transfer migration is ordered before this registry migration and
-- reserves nullable owner/media columns. A completed transfer can be bridged
-- into the verified registry and then fenced here by owner + exact object key.
DO $migration$
BEGIN
  IF to_regclass('public.oss_mirror_transfers') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM pg_catalog.pg_attribute AS attribute
       WHERE attribute.attrelid = 'public.oss_mirror_transfers'::regclass
         AND attribute.attname = 'media_asset_id'
         AND NOT attribute.attisdropped
     )
     AND EXISTS (
       SELECT 1
       FROM pg_catalog.pg_attribute AS attribute
       WHERE attribute.attrelid = 'public.oss_mirror_transfers'::regclass
         AND attribute.attname = 'owner_user_id'
         AND NOT attribute.attisdropped
     )
     AND EXISTS (
       SELECT 1
       FROM pg_catalog.pg_attribute AS attribute
       WHERE attribute.attrelid = 'public.oss_mirror_transfers'::regclass
         AND attribute.attname = 'object_key'
         AND NOT attribute.attisdropped
     ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_constraint AS constraint_row
      WHERE constraint_row.conname = 'oss_mirror_transfers_media_asset_id_fkey'
        AND constraint_row.conrelid = 'public.oss_mirror_transfers'::regclass
    ) THEN
      ALTER TABLE public.oss_mirror_transfers
        ADD CONSTRAINT oss_mirror_transfers_media_asset_id_fkey
        FOREIGN KEY (media_asset_id)
        REFERENCES private.media_assets(id)
        ON DELETE RESTRICT;
    END IF;

    CREATE INDEX IF NOT EXISTS oss_mirror_transfers_media_asset_id_idx
      ON public.oss_mirror_transfers (media_asset_id)
      WHERE media_asset_id IS NOT NULL;

    DROP TRIGGER IF EXISTS oss_mirror_transfers_validate_media_asset
      ON public.oss_mirror_transfers;
    CREATE TRIGGER oss_mirror_transfers_validate_media_asset
      BEFORE INSERT OR UPDATE
      ON public.oss_mirror_transfers
      FOR EACH ROW
      EXECUTE FUNCTION private.validate_oss_mirror_media_asset_reference();
  END IF;
END;
$migration$;

-- Explicit Data API permissions. public.media_asset_records is read-only;
-- callers cannot mutate lifecycle state by bypassing the RPC fences.
REVOKE ALL ON FUNCTION public.create_media_asset_upload(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, INTEGER, INTEGER, TIMESTAMPTZ, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_media_asset_upload(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, INTEGER, INTEGER, TIMESTAMPTZ, INTEGER, TEXT)
  TO service_role;

REVOKE ALL ON FUNCTION public.complete_media_asset_upload(UUID, UUID, BIGINT, TEXT, BIGINT, TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_media_asset_upload(UUID, UUID, BIGINT, TEXT, BIGINT, TEXT, INTEGER, INTEGER)
  TO service_role;

REVOKE ALL ON FUNCTION public.fail_media_asset_upload(UUID, UUID, BIGINT, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fail_media_asset_upload(UUID, UUID, BIGINT, TEXT)
  TO service_role;

REVOKE ALL ON FUNCTION public.resolve_media_asset_object(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_media_asset_object(UUID)
  TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_media_asset_status(UUID, UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_media_asset_status(UUID, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.resolve_verified_media_asset_for_worker(UUID, UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_verified_media_asset_for_worker(UUID, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.verify_media_asset(UUID, BIGINT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_media_asset(UUID, BIGINT) TO service_role;

REVOKE ALL ON FUNCTION public.claim_media_validation_jobs(INTEGER, INTEGER, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_media_validation_jobs(INTEGER, INTEGER, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.heartbeat_media_validation_job(UUID, UUID, BIGINT, INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.heartbeat_media_validation_job(UUID, UUID, BIGINT, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.complete_media_validation_job(UUID, UUID, BIGINT, TEXT, BIGINT, TEXT, INTEGER, INTEGER, BIGINT, JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_media_validation_job(UUID, UUID, BIGINT, TEXT, BIGINT, TEXT, INTEGER, INTEGER, BIGINT, JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.defer_media_validation_job(UUID, UUID, BIGINT, TEXT, BOOLEAN, INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.defer_media_validation_job(UUID, UUID, BIGINT, TEXT, BOOLEAN, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.recover_media_validation_jobs(INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recover_media_validation_jobs(INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.get_media_validation_queue_health()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_media_validation_queue_health() TO service_role;

REVOKE ALL ON FUNCTION public.claim_media_asset_cleanup(INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_media_asset_cleanup(INTEGER, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.authorize_media_asset_cleanup(UUID, UUID, BIGINT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.authorize_media_asset_cleanup(UUID, UUID, BIGINT) TO service_role;

REVOKE ALL ON FUNCTION public.confirm_media_asset_cleanup(UUID, UUID, BIGINT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_media_asset_cleanup(UUID, UUID, BIGINT) TO service_role;

REVOKE ALL ON FUNCTION public.nack_media_asset_cleanup(UUID, UUID, BIGINT, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.nack_media_asset_cleanup(UUID, UUID, BIGINT, TEXT, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.set_media_asset_legal_hold(UUID, BOOLEAN, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_media_asset_legal_hold(UUID, BOOLEAN, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.attach_media_asset_reference(UUID, UUID, TEXT, UUID, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.attach_media_asset_reference(UUID, UUID, TEXT, UUID, TEXT, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.detach_media_asset_reference(TEXT, UUID, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.detach_media_asset_reference(TEXT, UUID, TEXT, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.get_media_asset_lifecycle_health()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_media_asset_lifecycle_health() TO service_role;

COMMENT ON TABLE private.media_assets IS
  'Canonical Aliyun OSS object inventory. Never stores access keys, bearer credentials, or signed URLs.';
COMMENT ON TABLE public.media_asset_records IS
  'Read-only, RLS-protected Data API projection without object keys, checksums, errors, or lease tokens.';
COMMENT ON FUNCTION public.create_media_asset_upload(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, INTEGER, INTEGER, TIMESTAMPTZ, INTEGER, TEXT) IS
  'Idempotently reserves one owner-scoped OSS object and returns a fenced upload lease; does not mint or persist a signed URL.';
COMMENT ON FUNCTION public.claim_media_asset_cleanup(INTEGER, INTEGER) IS
  'Claims retention-expired, unreferenced, non-held objects with SKIP LOCKED and a versioned cleanup lease.';
COMMENT ON TABLE private.media_validation_jobs IS
  'Durable video full-validation queue. Uploaded is pending-validation; only fenced completion may promote video to verified.';
COMMENT ON FUNCTION public.complete_media_validation_job(UUID, UUID, BIGINT, TEXT, BIGINT, TEXT, INTEGER, INTEGER, BIGINT, JSONB) IS
  'Atomically settles a leased full-media validation and promotes exact matches to verified or isolates mismatches as quarantined.';

-- sha256 of the canonical production contract descriptor:
-- wanxiang-runtime-contract|2026-08-18.6|generation-outbox-bounded-fair-fenced-recovery-redrive-v5|oss-mirror-fenced-media-bridge-v2|media-registry-validation-v2|cleanup-linearized-v2|generation-links-retention-v1
CREATE OR REPLACE FUNCTION public.get_runtime_contract_version()
RETURNS TABLE(contract_version TEXT, contract_hash TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE((SELECT auth.role()), '') <> 'service_role' THEN
    RAISE EXCEPTION 'RUNTIME_CONTRACT_SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT
    '2026-08-18.6'::TEXT,
    '1dad0e31ba0f5b808009706a29595186274d92cb48a3f1395bc7028c8f2a3977'::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.get_runtime_contract_version()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_runtime_contract_version() TO service_role;

COMMENT ON FUNCTION public.get_runtime_contract_version() IS
  'Service-only exact runtime contract gate for migrations 20260818072132, 20260818083000, 20260818090000, and 20260818093405.';
