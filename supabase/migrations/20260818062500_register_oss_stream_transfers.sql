-- Register remote-image transfers as pending work so only the dedicated
-- transfer loop handles image bytes. The API/generation process only writes
-- control-plane state and waits for the durable worker result.
CREATE OR REPLACE FUNCTION public.register_oss_stream_transfer(
  p_id UUID,
  p_object_key TEXT,
  p_source_url_ciphertext TEXT,
  p_source_url_sha256 TEXT,
  p_source_host TEXT,
  p_generation_ref TEXT,
  p_expected_content_length BIGINT,
  p_expected_content_type TEXT,
  p_expires_at TIMESTAMPTZ
)
RETURNS SETOF public.oss_mirror_transfers
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  existing public.oss_mirror_transfers%ROWTYPE;
BEGIN
  IF p_source_url_ciphertext IS NULL OR length(p_source_url_ciphertext) NOT BETWEEN 16 AND 12000
    OR p_source_url_sha256 !~ '^[0-9a-f]{64}$'
    OR p_source_host IS NULL OR p_source_host <> lower(p_source_host)
    OR p_generation_ref IS NULL OR length(p_generation_ref) NOT BETWEEN 1 AND 240
    OR p_expected_content_length <= 0
    OR p_expected_content_type NOT IN ('image/avif', 'image/gif', 'image/jpeg', 'image/png', 'image/webp')
    OR p_expires_at <= now() OR p_expires_at > now() + interval '24 hours' THEN
    RAISE EXCEPTION 'invalid OSS stream transfer registration';
  END IF;

  INSERT INTO public.oss_mirror_transfers (
    id, object_key, source_url, source_url_ciphertext, source_url_sha256,
    source_host, generation_ref, status, attempts, lease_token,
    lease_expires_at, next_attempt_at, expires_at,
    expected_content_length, expected_content_type
  ) VALUES (
    p_id, p_object_key, NULL, p_source_url_ciphertext, p_source_url_sha256,
    p_source_host, p_generation_ref, 'pending', 0, NULL,
    NULL, now(), p_expires_at,
    p_expected_content_length, p_expected_content_type
  )
  ON CONFLICT (generation_ref) DO NOTHING;

  SELECT transfer.* INTO existing
  FROM public.oss_mirror_transfers AS transfer
  WHERE transfer.generation_ref = p_generation_ref
  FOR UPDATE;

  IF existing.id IS NULL THEN
    RAISE EXCEPTION 'OSS stream registration disappeared';
  END IF;

  IF existing.id <> p_id
    AND existing.status <> 'completed'
    AND (existing.status = 'failed' OR existing.expires_at <= now()) THEN
    UPDATE public.oss_mirror_transfers AS transfer
    SET object_key = p_object_key,
        source_url = NULL,
        source_url_ciphertext = p_source_url_ciphertext,
        source_url_sha256 = p_source_url_sha256,
        source_host = p_source_host,
        status = 'pending',
        attempts = 0,
        lease_token = NULL,
        lease_expires_at = NULL,
        next_attempt_at = now(),
        expires_at = p_expires_at,
        expected_content_length = p_expected_content_length,
        expected_content_type = p_expected_content_type,
        content_length = NULL,
        content_type = NULL,
        last_error = NULL,
        completed_at = NULL,
        resolver_hits = 0,
        last_resolved_at = NULL
    WHERE transfer.id = existing.id
    RETURNING transfer.* INTO existing;
  END IF;

  RETURN NEXT existing;
END;
$$;

REVOKE ALL ON FUNCTION public.register_oss_stream_transfer(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, TIMESTAMPTZ
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_oss_stream_transfer(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, TIMESTAMPTZ
) TO service_role;
