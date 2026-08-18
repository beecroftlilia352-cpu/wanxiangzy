ALTER TABLE public.oss_mirror_transfers
  ADD COLUMN IF NOT EXISTS resolver_hits INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_resolved_at TIMESTAMPTZ;

ALTER TABLE public.oss_mirror_transfers
  DROP CONSTRAINT IF EXISTS oss_mirror_transfers_resolver_hits_check;
ALTER TABLE public.oss_mirror_transfers
  ADD CONSTRAINT oss_mirror_transfers_resolver_hits_check
  CHECK (resolver_hits >= 0);

CREATE OR REPLACE FUNCTION public.record_oss_mirror_resolution(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_updated UUID;
BEGIN
  UPDATE public.oss_mirror_transfers
  SET
    resolver_hits = resolver_hits + 1,
    last_resolved_at = now()
  WHERE id = p_id
    AND status IN ('pending', 'processing')
    AND expires_at > now()
  RETURNING id INTO v_updated;

  RETURN v_updated IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.record_oss_mirror_resolution(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_oss_mirror_resolution(UUID)
  TO service_role;
