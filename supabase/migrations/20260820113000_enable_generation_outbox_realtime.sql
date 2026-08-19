-- Realtime is an accelerator for the transactional generation outbox. The
-- relay retains bounded polling as a delivery fallback, but production should
-- fail its release gate when the publication is absent or incomplete.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    RAISE EXCEPTION 'SUPABASE_REALTIME_PUBLICATION_MISSING';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'private'
      AND tablename = 'generation_job_outbox'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE private.generation_job_outbox';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_generation_outbox_realtime_ready()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE((SELECT auth.role()), '') <> 'service_role' THEN
    RAISE EXCEPTION 'GENERATION_OUTBOX_REALTIME_SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM pg_catalog.pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'private'
      AND tablename = 'generation_job_outbox'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_generation_outbox_realtime_ready()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_generation_outbox_realtime_ready() TO service_role;

COMMENT ON FUNCTION public.is_generation_outbox_realtime_ready() IS
  'Service-role release gate proving that the generation outbox is in the Supabase Realtime publication.';
