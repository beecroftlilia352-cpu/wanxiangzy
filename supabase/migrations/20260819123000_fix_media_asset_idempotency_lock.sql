-- PostgreSQL text values cannot contain NUL. The original media registry
-- advisory-lock key used chr(0), causing every valid upload registration to
-- fail before it could reach the idempotent insert.
DO $migration$
DECLARE
  v_signature CONSTANT TEXT :=
    'public.create_media_asset_upload(uuid,text,text,text,text,text,text,bigint,text,integer,integer,timestamp with time zone,integer,text)';
  v_function REGPROCEDURE;
  v_definition TEXT;
BEGIN
  v_function := to_regprocedure(v_signature);
  IF v_function IS NULL THEN
    RAISE EXCEPTION 'CREATE_MEDIA_ASSET_UPLOAD_FUNCTION_MISSING';
  END IF;

  SELECT pg_get_functiondef(v_function::OID)
  INTO v_definition;

  IF position('chr(0)' IN v_definition) > 0 THEN
    v_definition := replace(v_definition, 'chr(0)', 'chr(31)');
    EXECUTE v_definition;
  ELSIF position('chr(31)' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'CREATE_MEDIA_ASSET_UPLOAD_LOCK_CONTRACT_UNRECOGNIZED';
  END IF;
END;
$migration$;

COMMENT ON FUNCTION public.create_media_asset_upload(
  UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT,
  INTEGER, INTEGER, TIMESTAMPTZ, INTEGER, TEXT
) IS
  'Creates or replays a fenced private media upload. Advisory lock keys use a non-NUL unit separator.';
