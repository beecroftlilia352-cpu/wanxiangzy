-- Versioned Worker control-plane settings. The web process stores desired
-- capacity; the deployment controller applies infrastructure values to PM2.
CREATE OR REPLACE FUNCTION public.publish_worker_runtime_config(
  p_value JSONB,
  p_created_by UUID
)
RETURNS SETOF public.admin_config_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.admin_config_versions%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('worker.runtime.v1'));

  UPDATE public.admin_config_versions
  SET status = 'archived'
  WHERE config_key = 'worker.runtime.v1'
    AND status = 'published';

  INSERT INTO public.admin_config_versions (
    config_key, value, status, created_by, published_at
  ) VALUES (
    'worker.runtime.v1', p_value, 'published', p_created_by, now()
  )
  RETURNING * INTO v_row;

  RETURN NEXT v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_worker_runtime_config(JSONB, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_worker_runtime_config(JSONB, UUID) TO service_role;
