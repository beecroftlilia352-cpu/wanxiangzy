-- Product retouch batch production pipeline.
-- Run after schema.sql, atomic-credit-rpc.sql, admin-console.sql and task-queue-items.sql.

ALTER TABLE public.generations
  DROP CONSTRAINT IF EXISTS generations_status_check;

ALTER TABLE public.generations
  ADD CONSTRAINT generations_status_check
  CHECK (
    status IN (
      'uploading',
      'queued',
      'processing_tryon',
      'processing_face_swap',
      'processing_batch',
      'completed',
      'failed'
    )
  ) NOT VALID;

CREATE TABLE IF NOT EXISTS public.product_retouch_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_generation_id UUID NOT NULL UNIQUE REFERENCES public.generations(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'completed', 'partially_completed', 'failed')),
  mode TEXT NOT NULL
    CHECK (mode IN ('faithful-retouch', 'marketplace-white', 'studio-polish')),
  category TEXT NOT NULL DEFAULT 'auto',
  variants_per_source INTEGER NOT NULL CHECK (variants_per_source BETWEEN 1 AND 4),
  ai_model TEXT NOT NULL,
  aspect_ratio TEXT NOT NULL,
  image_size TEXT NOT NULL,
  user_instruction TEXT NOT NULL DEFAULT '',
  expected_count INTEGER NOT NULL CHECK (expected_count BETWEEN 1 AND 120),
  completed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  unit_credit_cost INTEGER NOT NULL CHECK (unit_credit_cost > 0),
  credits_cost INTEGER NOT NULL CHECK (credits_cost > 0),
  refund_amount INTEGER NOT NULL DEFAULT 0 CHECK (refund_amount >= 0),
  skill_config_version_id UUID,
  skill_version TEXT NOT NULL,
  skill_content_hash TEXT NOT NULL,
  skill_snapshot JSONB NOT NULL,
  settled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, request_id)
);

CREATE TABLE IF NOT EXISTS public.product_retouch_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.product_retouch_batches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  generation_id UUID NOT NULL UNIQUE REFERENCES public.generations(id) ON DELETE CASCADE,
  source_index INTEGER NOT NULL CHECK (source_index BETWEEN 0 AND 29),
  source_client_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_filename TEXT NOT NULL,
  variant_index INTEGER NOT NULL CHECK (variant_index BETWEEN 1 AND 4),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  result_url TEXT,
  error_message TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  content_sha256 TEXT,
  validation_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (batch_id, source_index, variant_index)
);

CREATE INDEX IF NOT EXISTS product_retouch_batches_user_created_idx
  ON public.product_retouch_batches(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS product_retouch_batches_user_status_idx
  ON public.product_retouch_batches(user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS product_retouch_outputs_batch_order_idx
  ON public.product_retouch_outputs(batch_id, source_index, variant_index);

CREATE INDEX IF NOT EXISTS product_retouch_outputs_batch_status_idx
  ON public.product_retouch_outputs(batch_id, status);

CREATE INDEX IF NOT EXISTS product_retouch_outputs_batch_hash_idx
  ON public.product_retouch_outputs(batch_id, content_sha256)
  WHERE content_sha256 IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS product_retouch_outputs_batch_hash_unique_idx
  ON public.product_retouch_outputs(batch_id, content_sha256)
  WHERE content_sha256 IS NOT NULL;

ALTER TABLE public.product_retouch_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_retouch_outputs ENABLE ROW LEVEL SECURITY;

-- Publish/rollback a runtime Skill version under one advisory lock so there is
-- never more than one active product-retouch definition.
CREATE OR REPLACE FUNCTION public.publish_product_retouch_skill_version(
  p_version_id UUID
)
RETURNS SETOF public.admin_config_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target public.admin_config_versions%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('skills.product-retouch'));

  SELECT *
    INTO v_target
  FROM public.admin_config_versions
  WHERE id = p_version_id
  FOR UPDATE;

  IF NOT FOUND OR v_target.config_key <> 'skills.product-retouch' THEN
    RAISE EXCEPTION 'PRODUCT_RETOUCH_SKILL_VERSION_NOT_FOUND'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.admin_config_versions
  SET status = 'archived'
  WHERE config_key = 'skills.product-retouch'
    AND status = 'published'
    AND id <> p_version_id;

  RETURN QUERY
  UPDATE public.admin_config_versions
  SET status = 'published',
      published_at = now()
  WHERE id = p_version_id
  RETURNING *;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_product_retouch_skill_version(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_product_retouch_skill_version(UUID) TO service_role;

DROP POLICY IF EXISTS "Users can view own product retouch batches"
  ON public.product_retouch_batches;
CREATE POLICY "Users can view own product retouch batches"
  ON public.product_retouch_batches FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own product retouch outputs"
  ON public.product_retouch_outputs;
CREATE POLICY "Users can view own product retouch outputs"
  ON public.product_retouch_outputs FOR SELECT
  USING (auth.uid() = user_id);

GRANT SELECT ON public.product_retouch_batches TO authenticated;
GRANT SELECT ON public.product_retouch_outputs TO authenticated;

CREATE OR REPLACE FUNCTION public.create_product_retouch_batch(
  p_user_id UUID,
  p_request_id TEXT,
  p_sources JSONB,
  p_mode TEXT,
  p_category TEXT,
  p_variants_per_source INTEGER,
  p_ai_model TEXT,
  p_aspect_ratio TEXT,
  p_image_size TEXT,
  p_user_instruction TEXT,
  p_unit_credit_cost INTEGER,
  p_public_base_url TEXT,
  p_skill_version TEXT,
  p_skill_content_hash TEXT,
  p_skill_config_version_id UUID,
  p_skill_snapshot JSONB,
  p_prompts JSONB
)
RETURNS TABLE(
  batch_id UUID,
  parent_generation_id UUID,
  credits_remaining INTEGER,
  credits_cost INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id UUID := gen_random_uuid();
  v_parent_generation_id UUID := gen_random_uuid();
  v_child_generation_id UUID;
  v_output_id UUID;
  v_balance INTEGER;
  v_source_count INTEGER;
  v_expected_count INTEGER;
  v_total_cost INTEGER;
  v_source JSONB;
  v_source_index INTEGER;
  v_variant_index INTEGER;
  v_prompt_index INTEGER;
  v_source_urls TEXT[];
  v_existing public.product_retouch_batches%ROWTYPE;
BEGIN
  IF length(trim(coalesce(p_request_id, ''))) < 8 OR length(p_request_id) > 120 THEN
    RAISE EXCEPTION 'INVALID_REQUEST_ID' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_sources) <> 'array' THEN
    RAISE EXCEPTION 'INVALID_SOURCES' USING ERRCODE = '22023';
  END IF;

  v_source_count := jsonb_array_length(p_sources);
  IF v_source_count < 1 OR v_source_count > 30 THEN
    RAISE EXCEPTION 'INVALID_SOURCE_COUNT' USING ERRCODE = '22023';
  END IF;
  IF p_variants_per_source < 1 OR p_variants_per_source > 4 THEN
    RAISE EXCEPTION 'INVALID_VARIANT_COUNT' USING ERRCODE = '22023';
  END IF;
  IF p_mode NOT IN ('faithful-retouch', 'marketplace-white', 'studio-polish') THEN
    RAISE EXCEPTION 'INVALID_MODE' USING ERRCODE = '22023';
  END IF;
  IF p_unit_credit_cost <= 0 THEN
    RAISE EXCEPTION 'INVALID_CREDIT_AMOUNT' USING ERRCODE = '22023';
  END IF;

  v_expected_count := v_source_count * p_variants_per_source;
  IF jsonb_typeof(p_prompts) <> 'array' OR jsonb_array_length(p_prompts) <> v_expected_count THEN
    RAISE EXCEPTION 'INVALID_PROMPT_COUNT' USING ERRCODE = '22023';
  END IF;
  v_total_cost := v_expected_count * p_unit_credit_cost;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT || ':' || p_request_id, 0));

  SELECT *
    INTO v_existing
  FROM public.product_retouch_batches
  WHERE user_id = p_user_id
    AND request_id = p_request_id;

  IF FOUND THEN
    SELECT credits INTO v_balance FROM public.profiles WHERE id = p_user_id;
    RETURN QUERY
      SELECT v_existing.id, v_existing.parent_generation_id, coalesce(v_balance, 0), v_existing.credits_cost;
    RETURN;
  END IF;

  SELECT coalesce(array_agg(source ->> 'url' ORDER BY ordinality), '{}')
    INTO v_source_urls
  FROM jsonb_array_elements(p_sources) WITH ORDINALITY AS source(source, ordinality);

  IF coalesce(array_length(v_source_urls, 1), 0) <> v_source_count
    OR EXISTS (
      SELECT 1
      FROM unnest(v_source_urls) AS url
      WHERE coalesce(trim(url), '') = ''
        OR url !~* '^(https?://|data:image/(png|jpe?g|webp);base64,)'
    )
  THEN
    RAISE EXCEPTION 'INVALID_SOURCE_URL' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
    SET
      credits = credits - v_total_cost,
      total_credits_used = coalesce(total_credits_used, 0) + v_total_cost,
      updated_at = now()
  WHERE id = p_user_id
    AND credits >= v_total_cost
  RETURNING credits INTO v_balance;

  IF v_balance IS NULL THEN
    SELECT credits INTO v_balance FROM public.profiles WHERE id = p_user_id;
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS:%', coalesce(v_balance, 0)
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.generations (
    id,
    user_id,
    clothing_urls,
    result_urls,
    status,
    credits_used,
    credits_cost,
    ai_model,
    image_size,
    job_payload
  )
  VALUES (
    v_parent_generation_id,
    p_user_id,
    v_source_urls,
    '{}',
    'processing_batch',
    v_total_cost,
    v_total_cost,
    p_ai_model,
    p_image_size,
    jsonb_build_object(
      'kind', 'productRetouch',
      'batchId', v_batch_id,
      'requestId', p_request_id,
      'mode', p_mode,
      'category', p_category,
      'variantsPerSource', p_variants_per_source,
      'expectedCount', v_expected_count,
      'genCount', v_expected_count,
      'aiModel', p_ai_model,
      'aspectRatio', p_aspect_ratio,
      'imageSize', p_image_size,
      'userInstruction', left(coalesce(p_user_instruction, ''), 1200),
      'skillVersion', p_skill_version,
      'skillContentHash', p_skill_content_hash,
      'batchStatus', 'processing',
      'completedCount', 0,
      'failedCount', 0,
      'asyncTask', jsonb_build_object('progress', 1, 'status', 'BATCH_PROCESSING', 'updatedAt', now())
    )
  );

  INSERT INTO public.product_retouch_batches (
    id,
    user_id,
    parent_generation_id,
    request_id,
    status,
    mode,
    category,
    variants_per_source,
    ai_model,
    aspect_ratio,
    image_size,
    user_instruction,
    expected_count,
    unit_credit_cost,
    credits_cost,
    skill_config_version_id,
    skill_version,
    skill_content_hash,
    skill_snapshot
  )
  VALUES (
    v_batch_id,
    p_user_id,
    v_parent_generation_id,
    p_request_id,
    'processing',
    p_mode,
    left(coalesce(p_category, 'auto'), 48),
    p_variants_per_source,
    p_ai_model,
    p_aspect_ratio,
    p_image_size,
    left(coalesce(p_user_instruction, ''), 1200),
    v_expected_count,
    p_unit_credit_cost,
    v_total_cost,
    p_skill_config_version_id,
    p_skill_version,
    p_skill_content_hash,
    p_skill_snapshot
  );

  v_source_index := 0;
  FOR v_source IN SELECT value FROM jsonb_array_elements(p_sources)
  LOOP
    FOR v_variant_index IN 1..p_variants_per_source
    LOOP
      v_prompt_index := v_source_index * p_variants_per_source + v_variant_index - 1;
      v_child_generation_id := gen_random_uuid();
      v_output_id := gen_random_uuid();

      INSERT INTO public.generations (
        id,
        user_id,
        clothing_urls,
        reference_url,
        result_urls,
        status,
        credits_used,
        credits_cost,
        ai_model,
        image_size,
        job_payload
      )
      VALUES (
        v_child_generation_id,
        p_user_id,
        ARRAY[v_source ->> 'url'],
        v_source ->> 'url',
        '{}',
        'queued',
        0,
        0,
        p_ai_model,
        p_image_size,
        jsonb_build_object(
          'kind', 'productRetouch',
          'internalTask', true,
          'batchId', v_batch_id,
          'outputId', v_output_id,
          'sourceClientId', coalesce(v_source ->> 'clientId', 'source-' || (v_source_index + 1)::TEXT),
          'sourceIndex', v_source_index,
          'variantIndex', v_variant_index,
          'sourceUrl', v_source ->> 'url',
          'sourceFilename', coalesce(v_source ->> 'filename', '商品-' || (v_source_index + 1)::TEXT),
          'mode', p_mode,
          'category', p_category,
          'userInstruction', left(coalesce(p_user_instruction, ''), 1200),
          'skillVersion', p_skill_version,
          'skillContentHash', p_skill_content_hash,
          'hardValidationPolicy', coalesce(p_skill_snapshot -> 'hardValidation', '{}'::jsonb),
          'aiModel', p_ai_model,
          'aspectRatio', p_aspect_ratio,
          'imageSize', p_image_size,
          'prompt', p_prompts ->> v_prompt_index,
          'genCount', 1,
          'publicBaseUrl', p_public_base_url
        )
      );

      INSERT INTO public.product_retouch_outputs (
        id,
        batch_id,
        user_id,
        generation_id,
        source_index,
        source_client_id,
        source_url,
        source_filename,
        variant_index,
        status
      )
      VALUES (
        v_output_id,
        v_batch_id,
        p_user_id,
        v_child_generation_id,
        v_source_index,
        coalesce(v_source ->> 'clientId', 'source-' || (v_source_index + 1)::TEXT),
        v_source ->> 'url',
        coalesce(v_source ->> 'filename', '商品-' || (v_source_index + 1)::TEXT),
        v_variant_index,
        'queued'
      );
    END LOOP;
    v_source_index := v_source_index + 1;
  END LOOP;

  INSERT INTO public.credit_logs (
    user_id,
    amount,
    balance,
    reason,
    generation_id
  )
  VALUES (
    p_user_id,
    -v_total_cost,
    v_balance,
    '商品精修批次 ' || v_expected_count || ' 张 (' || p_ai_model || ', ' || p_image_size || ')',
    v_parent_generation_id
  );

  RETURN QUERY SELECT v_batch_id, v_parent_generation_id, v_balance, v_total_cost;
END;
$$;

REVOKE ALL ON FUNCTION public.create_product_retouch_batch(
  UUID, TEXT, JSONB, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, INTEGER,
  TEXT, TEXT, TEXT, UUID, JSONB, JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_product_retouch_batch(
  UUID, TEXT, JSONB, TEXT, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, INTEGER,
  TEXT, TEXT, TEXT, UUID, JSONB, JSONB
) TO service_role;

CREATE OR REPLACE FUNCTION public.retry_product_retouch_output(
  p_user_id UUID,
  p_output_id UUID,
  p_prompt TEXT,
  p_public_base_url TEXT
)
RETURNS TABLE(
  generation_id UUID,
  batch_id UUID,
  credits_remaining INTEGER,
  credits_cost INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_output public.product_retouch_outputs%ROWTYPE;
  v_batch public.product_retouch_batches%ROWTYPE;
  v_generation_id UUID := gen_random_uuid();
  v_balance INTEGER;
BEGIN
  SELECT *
    INTO v_output
  FROM public.product_retouch_outputs
  WHERE id = p_output_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OUTPUT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF v_output.status <> 'failed' THEN
    RAISE EXCEPTION 'OUTPUT_NOT_RETRYABLE' USING ERRCODE = '55000';
  END IF;

  SELECT *
    INTO v_batch
  FROM public.product_retouch_batches
  WHERE id = v_output.batch_id
    AND user_id = p_user_id
  FOR UPDATE;

  UPDATE public.profiles
    SET
      credits = credits - v_batch.unit_credit_cost,
      total_credits_used = coalesce(total_credits_used, 0) + v_batch.unit_credit_cost,
      updated_at = now()
  WHERE id = p_user_id
    AND credits >= v_batch.unit_credit_cost
  RETURNING credits INTO v_balance;

  IF v_balance IS NULL THEN
    SELECT credits INTO v_balance FROM public.profiles WHERE id = p_user_id;
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS:%', coalesce(v_balance, 0)
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.generations (
    id,
    user_id,
    clothing_urls,
    reference_url,
    result_urls,
    status,
    credits_used,
    credits_cost,
    ai_model,
    image_size,
    job_payload
  )
  VALUES (
    v_generation_id,
    p_user_id,
    ARRAY[v_output.source_url],
    v_output.source_url,
    '{}',
    'queued',
    v_batch.unit_credit_cost,
    v_batch.unit_credit_cost,
    v_batch.ai_model,
    v_batch.image_size,
    jsonb_build_object(
      'kind', 'productRetouch',
      'internalTask', true,
      'batchId', v_batch.id,
      'outputId', v_output.id,
      'sourceClientId', v_output.source_client_id,
      'sourceIndex', v_output.source_index,
      'variantIndex', v_output.variant_index,
      'sourceUrl', v_output.source_url,
      'sourceFilename', v_output.source_filename,
      'mode', v_batch.mode,
      'category', v_batch.category,
      'userInstruction', v_batch.user_instruction,
      'skillVersion', v_batch.skill_version,
      'skillContentHash', v_batch.skill_content_hash,
      'hardValidationPolicy', coalesce(v_batch.skill_snapshot -> 'hardValidation', '{}'::jsonb),
      'aiModel', v_batch.ai_model,
      'aspectRatio', v_batch.aspect_ratio,
      'imageSize', v_batch.image_size,
      'prompt', p_prompt,
      'genCount', 1,
      'publicBaseUrl', p_public_base_url,
      'retryOfGenerationId', v_output.generation_id
    )
  );

  UPDATE public.product_retouch_outputs
  SET
    generation_id = v_generation_id,
    status = 'queued',
    result_url = NULL,
    error_message = NULL,
    content_sha256 = NULL,
    validation_metadata = '{}'::jsonb,
    attempt_count = attempt_count + 1,
    updated_at = now()
  WHERE id = v_output.id;

  UPDATE public.product_retouch_batches
  SET
    status = 'processing',
    failed_count = greatest(failed_count - 1, 0),
    completed_at = NULL,
    updated_at = now()
  WHERE id = v_batch.id;

  UPDATE public.generations
  SET
    status = 'processing_batch',
    completed_at = NULL,
    error_message = NULL,
    job_payload = job_payload || jsonb_build_object(
      'batchStatus', 'processing',
      'failedCount', greatest(v_batch.failed_count - 1, 0),
      'asyncTask', coalesce(job_payload -> 'asyncTask', '{}'::jsonb)
        || jsonb_build_object('status', 'BATCH_PROCESSING', 'updatedAt', now())
    )
  WHERE id = v_batch.parent_generation_id;

  INSERT INTO public.credit_logs (
    user_id,
    amount,
    balance,
    reason,
    generation_id
  )
  VALUES (
    p_user_id,
    -v_batch.unit_credit_cost,
    v_balance,
    '商品精修单项重试',
    v_generation_id
  );

  RETURN QUERY SELECT v_generation_id, v_batch.id, v_balance, v_batch.unit_credit_cost;
END;
$$;

REVOKE ALL ON FUNCTION public.retry_product_retouch_output(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.retry_product_retouch_output(UUID, UUID, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.sync_product_retouch_generation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload JSONB := coalesce(NEW.job_payload, '{}'::jsonb);
  v_output_id UUID;
  v_batch_id UUID;
  v_batch public.product_retouch_batches%ROWTYPE;
  v_output_status TEXT;
  v_result_url TEXT;
  v_validation JSONB := coalesce(v_payload -> 'hardValidation', '{}'::jsonb);
  v_content_sha256 TEXT;
  v_completed_count INTEGER;
  v_failed_count INTEGER;
  v_terminal_count INTEGER;
  v_status TEXT;
  v_result_urls TEXT[];
  v_refund INTEGER;
  v_balance INTEGER;
BEGIN
  IF coalesce(v_payload ->> 'kind', '') = 'productRetouch'
    AND coalesce((v_payload ->> 'internalTask')::BOOLEAN, false) IS NOT TRUE
  THEN
    IF to_regclass('public.task_queue_items') IS NOT NULL THEN
      UPDATE public.task_queue_items
      SET
        module = 'productRetouch',
        title = U&'\5546\54C1\7CBE\4FEE',
        apply_url = '/product-retouch?apply=' || NEW.id::TEXT
      WHERE source_type = 'generation' AND source_id = NEW.id;
    END IF;
    RETURN NEW;
  END IF;

  IF coalesce(v_payload ->> 'kind', '') <> 'productRetouch'
    OR coalesce((v_payload ->> 'internalTask')::BOOLEAN, false) IS NOT TRUE
  THEN
    RETURN NEW;
  END IF;

  SELECT id, batch_id
    INTO v_output_id, v_batch_id
  FROM public.product_retouch_outputs
  WHERE generation_id = NEW.id
  FOR UPDATE;

  IF NOT FOUND THEN
    IF to_regclass('public.task_queue_items') IS NOT NULL THEN
      DELETE FROM public.task_queue_items
      WHERE source_type = 'generation' AND source_id = NEW.id;
    END IF;
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_batch_id::TEXT, 0));
  SELECT * INTO v_batch
  FROM public.product_retouch_batches
  WHERE id = v_batch_id
  FOR UPDATE;

  v_result_url := CASE
    WHEN coalesce(array_length(NEW.result_urls, 1), 0) > 0 THEN NEW.result_urls[1]
    ELSE NULL
  END;
  v_output_status := CASE
    WHEN NEW.status = 'completed' AND v_result_url IS NOT NULL THEN 'completed'
    WHEN NEW.status = 'failed' THEN 'failed'
    WHEN NEW.status LIKE 'processing%' THEN 'processing'
    ELSE 'queued'
  END;
  v_content_sha256 := nullif(v_validation ->> 'sha256', '');

  UPDATE public.product_retouch_outputs
  SET
    status = v_output_status,
    result_url = CASE WHEN v_output_status = 'completed' THEN v_result_url ELSE NULL END,
    error_message = CASE
      WHEN v_output_status = 'failed' THEN coalesce(NEW.error_message, '商品精修失败')
      ELSE NULL
    END,
    content_sha256 = CASE WHEN v_output_status = 'completed' THEN v_content_sha256 ELSE NULL END,
    validation_metadata = CASE WHEN v_output_status = 'completed' THEN v_validation ELSE '{}'::jsonb END,
    updated_at = now()
  WHERE id = v_output_id;

  IF v_output_status = 'completed'
    AND v_content_sha256 IS NOT NULL
    AND coalesce((v_batch.skill_snapshot -> 'hardValidation' ->> 'rejectDuplicateContent')::BOOLEAN, true)
    AND EXISTS (
      SELECT 1
      FROM public.product_retouch_outputs
      WHERE batch_id = v_batch_id
        AND id <> v_output_id
        AND status = 'completed'
        AND content_sha256 = v_content_sha256
    )
  THEN
    UPDATE public.product_retouch_outputs
    SET
      status = 'failed',
      result_url = NULL,
      error_message = '结果与批次内已有图片重复',
      updated_at = now()
    WHERE id = v_output_id;
  END IF;

  SELECT
    count(*) FILTER (WHERE status = 'completed'),
    count(*) FILTER (WHERE status = 'failed'),
    count(*) FILTER (WHERE status IN ('completed', 'failed'))
  INTO v_completed_count, v_failed_count, v_terminal_count
  FROM public.product_retouch_outputs
  WHERE batch_id = v_batch_id;

  v_status := CASE
    WHEN v_terminal_count < v_batch.expected_count
      THEN CASE
        WHEN EXISTS (
          SELECT 1 FROM public.product_retouch_outputs
          WHERE batch_id = v_batch_id AND status = 'processing'
        ) THEN 'processing'
        ELSE 'queued'
      END
    WHEN v_completed_count = v_batch.expected_count THEN 'completed'
    WHEN v_completed_count = 0 THEN 'failed'
    ELSE 'partially_completed'
  END;

  SELECT coalesce(array_agg(result_url ORDER BY source_index, variant_index), '{}')
    INTO v_result_urls
  FROM public.product_retouch_outputs
  WHERE batch_id = v_batch_id
    AND status = 'completed'
    AND result_url IS NOT NULL;

  UPDATE public.product_retouch_batches
  SET
    status = v_status,
    completed_count = v_completed_count,
    failed_count = v_failed_count,
    completed_at = CASE WHEN v_terminal_count = expected_count THEN coalesce(completed_at, now()) ELSE NULL END,
    updated_at = now()
  WHERE id = v_batch_id;

  UPDATE public.generations
  SET
    status = CASE
      WHEN v_terminal_count < v_batch.expected_count THEN 'processing_batch'
      WHEN v_completed_count > 0 THEN 'completed'
      ELSE 'failed'
    END,
    result_urls = v_result_urls,
    error_message = CASE
      WHEN v_status = 'failed' THEN '商品精修批次失败'
      WHEN v_status = 'partially_completed' THEN v_failed_count || ' 个输出失败'
      ELSE NULL
    END,
    completed_at = CASE
      WHEN v_terminal_count = v_batch.expected_count THEN coalesce(completed_at, now())
      ELSE NULL
    END,
    job_payload = job_payload || jsonb_build_object(
      'batchStatus', v_status,
      'completedCount', v_completed_count,
      'failedCount', v_failed_count,
      'expectedCount', v_batch.expected_count,
      'asyncTask', coalesce(job_payload -> 'asyncTask', '{}'::jsonb)
        || jsonb_build_object(
          'progress', least(100, greatest(1, round(100.0 * v_terminal_count / v_batch.expected_count)::INTEGER)),
          'status', CASE WHEN v_terminal_count = v_batch.expected_count THEN upper(v_status) ELSE 'BATCH_PROCESSING' END,
          'updatedAt', now()
        )
    )
  WHERE id = v_batch.parent_generation_id;

  IF v_terminal_count = v_batch.expected_count AND v_batch.settled_at IS NULL THEN
    v_refund := least(v_batch.credits_cost, v_failed_count * v_batch.unit_credit_cost);

    UPDATE public.product_retouch_batches
    SET
      refund_amount = v_refund,
      settled_at = now(),
      updated_at = now()
    WHERE id = v_batch_id
      AND settled_at IS NULL;

    UPDATE public.generations
    SET credits_used = greatest(v_batch.credits_cost - v_refund, 0)
    WHERE id = v_batch.parent_generation_id;

    IF v_refund > 0 THEN
      UPDATE public.profiles
      SET
        credits = credits + v_refund,
        total_credits_used = greatest(coalesce(total_credits_used, 0) - v_refund, 0),
        updated_at = now()
      WHERE id = v_batch.user_id
      RETURNING credits INTO v_balance;

      INSERT INTO public.credit_logs (
        user_id,
        amount,
        balance,
        reason,
        generation_id
      )
      VALUES (
        v_batch.user_id,
        v_refund,
        v_balance,
        '商品精修失败槽位退还',
        v_batch.parent_generation_id
      );
    END IF;
  END IF;

  IF to_regclass('public.task_queue_items') IS NOT NULL THEN
    DELETE FROM public.task_queue_items
    WHERE source_type = 'generation' AND source_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zz_product_retouch_generation_sync ON public.generations;
CREATE TRIGGER zz_product_retouch_generation_sync
  AFTER INSERT OR UPDATE OF status, result_urls, job_payload, error_message
  ON public.generations
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_product_retouch_generation();
