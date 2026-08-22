BEGIN;

-- A child provider slot may fail while its parent batch is still running or
-- waiting for a tenant/provider lease.  Keep that diagnostic in job_payload,
-- but do not let stale queue metadata or child status make the parent look
-- terminal before durable settlement has happened.
CREATE OR REPLACE FUNCTION public.normalize_generation_parent_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IN ('processing_tryon', 'processing_face_swap')
     AND OLD.status = 'queued' THEN
    NEW.queue_reason := NULL;
    NEW.available_at := clock_timestamp();
  ELSIF NEW.status IN ('completed', 'failed') THEN
    NEW.queue_reason := NULL;
    NEW.available_at := clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS generations_normalize_parent_state ON public.generations;
CREATE TRIGGER generations_normalize_parent_state
  BEFORE UPDATE OF status ON public.generations
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_generation_parent_state();

-- Capacity deferral starts a new parent execution attempt.  Preserve durable
-- slot/checkpoint data, but clear the previous attempt's terminal diagnostic so
-- the API cannot render a queued retry as a finished failure.
CREATE OR REPLACE FUNCTION private.reset_generation_child_progress_on_capacity_wait()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payload JSONB := COALESCE(NEW.job_payload, '{}'::jsonb);
  v_async JSONB := COALESCE(v_payload -> 'asyncTask', '{}'::jsonb);
BEGIN
  IF NEW.status = 'queued'
     AND NEW.queue_reason IN ('tenant_capacity', 'provider_capacity')
     AND (OLD.status = 'processing_tryon' OR OLD.status = 'processing_face_swap') THEN
    v_payload := v_payload - 'partialFailure';
    v_async := v_async || jsonb_build_object(
      'status', 'QUEUED',
      'updatedAt', clock_timestamp()
    );
    NEW.job_payload := jsonb_set(v_payload, '{asyncTask}', v_async, true);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS generations_reset_child_progress_on_capacity_wait ON public.generations;
CREATE TRIGGER generations_reset_child_progress_on_capacity_wait
  BEFORE UPDATE OF status, queue_reason, job_payload ON public.generations
  FOR EACH ROW
  EXECUTE FUNCTION private.reset_generation_child_progress_on_capacity_wait();

-- Keep the lightweight recent-task projection synchronized even when a
-- completion is written by recovery/admin SQL rather than the Node worker.
CREATE OR REPLACE FUNCTION private.sync_generation_task_queue_projection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result_count INTEGER := (
    SELECT count(*)::INTEGER
    FROM unnest(COALESCE(NEW.result_urls, ARRAY[]::TEXT[])) AS value
    WHERE btrim(value) <> ''
  );
BEGIN
  UPDATE public.task_queue_items AS item
  SET status = NEW.status,
      status_group = public.task_queue_status_group(NEW.status, v_result_count),
      progress = CASE
        WHEN NEW.status = 'completed' THEN 100
        WHEN NEW.status = 'failed' THEN 0
        ELSE item.progress
      END,
      result_count = v_result_count,
      result_thumbnails = CASE
        WHEN v_result_count > 0 THEN COALESCE(NEW.result_urls, ARRAY[]::TEXT[])
        ELSE item.result_thumbnails
      END,
      error_message = CASE WHEN NEW.status = 'failed' THEN NEW.error_message ELSE NULL END,
      completed_at = CASE WHEN NEW.status IN ('completed', 'failed') THEN COALESCE(NEW.completed_at, NEW.updated_at) ELSE NULL END,
      updated_at = NEW.updated_at
  WHERE item.source_type = 'generation'
    AND item.source_id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS generations_sync_task_queue_projection ON public.generations;
CREATE TRIGGER generations_sync_task_queue_projection
  AFTER UPDATE OF status, result_urls, error_message, completed_at, job_payload ON public.generations
  FOR EACH ROW
  EXECUTE FUNCTION private.sync_generation_task_queue_projection();

-- Repair rows written by the pre-fix projection. The durable generations row
-- is authoritative for status and result count.
UPDATE public.task_queue_items AS item
SET status = generation.status,
    status_group = public.task_queue_status_group(generation.status, (
      SELECT count(*)::INTEGER
      FROM unnest(COALESCE(generation.result_urls, ARRAY[]::TEXT[])) AS value
      WHERE btrim(value) <> ''
    )),
    progress = CASE WHEN generation.status = 'completed' THEN 100 ELSE item.progress END,
    result_count = (
      SELECT count(*)::INTEGER
      FROM unnest(COALESCE(generation.result_urls, ARRAY[]::TEXT[])) AS value
      WHERE btrim(value) <> ''
    ),
    result_thumbnails = CASE
      WHEN cardinality(COALESCE(generation.result_urls, ARRAY[]::TEXT[])) > 0
        THEN generation.result_urls
      ELSE item.result_thumbnails
    END,
    error_message = CASE WHEN generation.status = 'failed' THEN generation.error_message ELSE NULL END,
    completed_at = CASE WHEN generation.status IN ('completed', 'failed') THEN COALESCE(generation.completed_at, generation.updated_at) ELSE NULL END,
    updated_at = generation.updated_at
FROM public.generations AS generation
WHERE item.source_type = 'generation'
  AND item.source_id = generation.id;

REVOKE ALL ON FUNCTION public.normalize_generation_parent_state() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.reset_generation_child_progress_on_capacity_wait() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.sync_generation_task_queue_projection() FROM PUBLIC, anon, authenticated;

-- sha256 of:
-- wanxiang-runtime-contract|2026-08-22.7|generation-service-entitlements-v1|generation-tiered-outbox-priority-v1|generation-capacity-backpressure-v2|generation-tenant-backpressure-v1|tenant-wait-sla-v1|generation-retryable-backpressure-v1|provider-account-capacity-v2|image-idempotency-v1|worker-shutdown-fence-v1|admin-generation-requeue-v1|admin-generation-settlement-v1|generation-outbox-bounded-fair-fenced-recovery-redrive-v5|oss-mirror-fenced-media-bridge-v2|media-registry-validation-v2|cleanup-linearized-v2|generation-links-retention-v1|stale-capacity-watchdog-v1|partial-refund-v1|generation-parent-state-consistency-v1
CREATE OR REPLACE FUNCTION public.get_runtime_contract_version()
RETURNS TABLE(contract_version TEXT, contract_hash TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    '2026-08-22.7'::TEXT,
    'd55a0cf49e5deb81aedc516300b9648447a2bd25421426d2d035f680163e2dff'::TEXT;
$$;

COMMIT;
