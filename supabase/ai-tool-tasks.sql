-- ============================================================
-- Durable ownership and output persistence for /api/ai-tools.
-- Run after resource-library.sql (depends on resource_library_assets).
-- This script is safe to run repeatedly.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_tool_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL
    CHECK (request_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,119}$'),
  provider TEXT NOT NULL
    CHECK (provider ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'),
  provider_task_id TEXT
    CHECK (provider_task_id IS NULL OR provider_task_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$'),
  operation TEXT NOT NULL
    CHECK (operation IN (
      'matting', 'upscale', 'outpaint', 'erase',
      'repair-limbs', 'repair-garment', 'repair-footwear', 'resize'
    )),
  request_fingerprint TEXT NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  source_asset_id UUID REFERENCES public.resource_library_assets(id) ON DELETE SET NULL,
  source_url TEXT NOT NULL CHECK (source_url ~ '^https://'),
  source_width INTEGER CHECK (source_width IS NULL OR source_width > 0),
  source_height INTEGER CHECK (source_height IS NULL OR source_height > 0),
  source_ownership JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(source_ownership) = 'object'),
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(request_payload) = 'object'),
  status TEXT NOT NULL DEFAULT 'submitting'
    CHECK (status IN ('submitting', 'queued', 'processing', 'completed', 'failed')),
  provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(provider_payload) = 'object'),
  outputs JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(outputs) = 'array'),
  result_urls TEXT[] NOT NULL DEFAULT '{}',
  response_payload JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(response_payload) = 'object'),
  output_signature TEXT CHECK (output_signature IS NULL OR output_signature ~ '^[0-9a-f]{64}$'),
  output_persistence_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (output_persistence_status IN ('pending', 'processing', 'completed', 'failed')),
  submission_lease_token UUID,
  submission_lease_expires_at TIMESTAMPTZ,
  output_lease_token UUID,
  output_lease_expires_at TIMESTAMPTZ,
  generation_id UUID REFERENCES public.generations(id) ON DELETE SET NULL,
  last_error JSONB CHECK (last_error IS NULL OR jsonb_typeof(last_error) = 'object'),
  submitted_at TIMESTAMPTZ,
  last_polled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_tool_tasks_user_request_key UNIQUE (user_id, request_id),
  CONSTRAINT ai_tool_tasks_provider_task_key UNIQUE (provider, provider_task_id),
  CONSTRAINT ai_tool_tasks_user_provider_task_key UNIQUE (user_id, provider_task_id),
  CONSTRAINT ai_tool_tasks_source_dimensions_shape_chk CHECK (
    (source_width IS NULL AND source_height IS NULL)
    OR (source_width IS NOT NULL AND source_height IS NOT NULL)
  ),
  CONSTRAINT ai_tool_tasks_submission_lease_shape_chk CHECK (
    (submission_lease_token IS NULL AND submission_lease_expires_at IS NULL)
    OR (submission_lease_token IS NOT NULL AND submission_lease_expires_at IS NOT NULL)
  ),
  CONSTRAINT ai_tool_tasks_output_lease_shape_chk CHECK (
    (output_lease_token IS NULL AND output_lease_expires_at IS NULL)
    OR (output_lease_token IS NOT NULL AND output_lease_expires_at IS NOT NULL)
  ),
  CONSTRAINT ai_tool_tasks_persisted_output_shape_chk CHECK (
    output_persistence_status <> 'completed'
    OR (
      output_signature IS NOT NULL
      AND jsonb_array_length(outputs) > 0
      AND cardinality(result_urls) > 0
      AND response_payload <> '{}'::jsonb
    )
  )
);

ALTER TABLE public.ai_tool_tasks
  ADD COLUMN IF NOT EXISTS request_payload JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.ai_tool_tasks'::regclass
      AND conname = 'ai_tool_tasks_request_payload_object_chk'
  ) THEN
    ALTER TABLE public.ai_tool_tasks
      ADD CONSTRAINT ai_tool_tasks_request_payload_object_chk
      CHECK (jsonb_typeof(request_payload) = 'object');
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS ai_tool_tasks_user_status_updated_idx
  ON public.ai_tool_tasks (user_id, status, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS ai_tool_tasks_generation_idx
  ON public.ai_tool_tasks (generation_id)
  WHERE generation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ai_tool_tasks_stale_submission_lease_idx
  ON public.ai_tool_tasks (submission_lease_expires_at)
  WHERE provider_task_id IS NULL AND submission_lease_expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS ai_tool_tasks_stale_output_lease_idx
  ON public.ai_tool_tasks (output_lease_expires_at)
  WHERE output_persistence_status = 'processing';

ALTER TABLE public.ai_tool_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own AI tool tasks" ON public.ai_tool_tasks;
CREATE POLICY "Users can view own AI tool tasks"
  ON public.ai_tool_tasks FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Browser clients may read their task history but cannot forge bindings or
-- mutate persistence state. All writes go through the server service role.
REVOKE ALL ON public.ai_tool_tasks FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ai_tool_tasks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_tool_tasks TO service_role;

CREATE OR REPLACE FUNCTION public.touch_ai_tool_tasks_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ai_tool_tasks_touch_updated_at ON public.ai_tool_tasks;
CREATE TRIGGER ai_tool_tasks_touch_updated_at
  BEFORE UPDATE ON public.ai_tool_tasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_ai_tool_tasks_updated_at();

REVOKE ALL ON FUNCTION public.touch_ai_tool_tasks_updated_at()
  FROM PUBLIC, anon, authenticated;

-- Atomically claims one completed provider payload for OSS persistence. The
-- row lock is held only for this database operation; remote image/OSS work is
-- performed after the transaction has ended.
CREATE OR REPLACE FUNCTION public.claim_ai_tool_output_persistence(
  p_task_id UUID,
  p_user_id UUID,
  p_output_signature TEXT,
  p_lease_token UUID,
  p_lease_expires_at TIMESTAMPTZ
)
RETURNS TABLE (
  claim_state TEXT,
  persisted_outputs JSONB,
  persisted_response JSONB
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_task public.ai_tool_tasks%ROWTYPE;
BEGIN
  IF p_output_signature !~ '^[0-9a-f]{64}$'
    OR p_lease_expires_at <= now()
    OR p_lease_expires_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'invalid AI tool output persistence claim';
  END IF;

  SELECT * INTO v_task
  FROM public.ai_tool_tasks
  WHERE id = p_task_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::JSONB, NULL::JSONB;
    RETURN;
  END IF;

  IF v_task.output_persistence_status = 'completed' THEN
    IF v_task.output_signature = p_output_signature THEN
      RETURN QUERY SELECT 'cached'::TEXT, v_task.outputs, v_task.response_payload;
    ELSE
      RETURN QUERY SELECT 'conflict'::TEXT, NULL::JSONB, NULL::JSONB;
    END IF;
    RETURN;
  END IF;

  IF v_task.output_signature IS NOT NULL
    AND v_task.output_signature <> p_output_signature THEN
    RETURN QUERY SELECT 'conflict'::TEXT, NULL::JSONB, NULL::JSONB;
    RETURN;
  END IF;

  IF v_task.output_persistence_status = 'processing'
    AND v_task.output_lease_expires_at > now() THEN
    RETURN QUERY SELECT 'busy'::TEXT, NULL::JSONB, NULL::JSONB;
    RETURN;
  END IF;

  UPDATE public.ai_tool_tasks
  SET output_signature = p_output_signature,
      output_persistence_status = 'processing',
      output_lease_token = p_lease_token,
      output_lease_expires_at = p_lease_expires_at,
      last_error = NULL
  WHERE id = p_task_id;

  RETURN QUERY SELECT 'claimed'::TEXT, NULL::JSONB, NULL::JSONB;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_ai_tool_output_persistence(
  p_task_id UUID,
  p_user_id UUID,
  p_output_signature TEXT,
  p_lease_token UUID,
  p_outputs JSONB,
  p_result_urls TEXT[],
  p_response_payload JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  IF jsonb_typeof(p_outputs) <> 'array'
    OR jsonb_array_length(p_outputs) = 0
    OR cardinality(p_result_urls) = 0
    OR jsonb_typeof(p_response_payload) <> 'object'
    OR p_response_payload = '{}'::jsonb THEN
    RAISE EXCEPTION 'invalid AI tool persisted output payload';
  END IF;

  UPDATE public.ai_tool_tasks
  SET outputs = p_outputs,
      result_urls = p_result_urls,
      response_payload = p_response_payload,
      output_persistence_status = 'completed',
      output_lease_token = NULL,
      output_lease_expires_at = NULL,
      status = 'completed',
      completed_at = COALESCE(completed_at, now()),
      last_error = NULL
  WHERE id = p_task_id
    AND user_id = p_user_id
    AND output_signature = p_output_signature
    AND output_persistence_status = 'processing'
    AND output_lease_token = p_lease_token;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_ai_tool_output_persistence(
  p_task_id UUID,
  p_user_id UUID,
  p_output_signature TEXT,
  p_lease_token UUID,
  p_error JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  IF jsonb_typeof(p_error) <> 'object' THEN
    RAISE EXCEPTION 'invalid AI tool persistence error payload';
  END IF;

  UPDATE public.ai_tool_tasks
  SET output_persistence_status = 'failed',
      output_lease_token = NULL,
      output_lease_expires_at = NULL,
      last_error = p_error
  WHERE id = p_task_id
    AND user_id = p_user_id
    AND output_signature = p_output_signature
    AND output_persistence_status = 'processing'
    AND output_lease_token = p_lease_token;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ai_tool_output_persistence(UUID, UUID, TEXT, UUID, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_ai_tool_output_persistence(UUID, UUID, TEXT, UUID, JSONB, TEXT[], JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_ai_tool_output_persistence(UUID, UUID, TEXT, UUID, JSONB)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_ai_tool_output_persistence(UUID, UUID, TEXT, UUID, TIMESTAMPTZ)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_ai_tool_output_persistence(UUID, UUID, TEXT, UUID, JSONB, TEXT[], JSONB)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_ai_tool_output_persistence(UUID, UUID, TEXT, UUID, JSONB)
  TO service_role;
