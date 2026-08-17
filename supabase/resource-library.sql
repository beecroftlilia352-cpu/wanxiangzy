-- User resource library and saved prompts.
-- Idempotent compatibility migration for existing installations.

CREATE TABLE IF NOT EXISTS public.resource_library_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('upload', 'generation')),
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
  module_key TEXT,
  url TEXT NOT NULL CHECK (url ~ '^https?://'),
  preview_url TEXT CHECK (preview_url IS NULL OR preview_url ~ '^https?://'),
  storage_provider TEXT NOT NULL DEFAULT 'unknown'
    CHECK (storage_provider IN ('aliyun-oss', 'imgbb', 'external', 'unknown')),
  object_key TEXT,
  source_generation_id UUID REFERENCES public.generations(id) ON DELETE SET NULL,
  source_result_index SMALLINT CHECK (source_result_index IS NULL OR source_result_index >= 0),
  origin_key TEXT NOT NULL CHECK (char_length(origin_key) BETWEEN 3 AND 240),
  group_key TEXT,
  group_total INTEGER NOT NULL DEFAULT 1 CHECK (group_total BETWEEN 1 AND 240),
  title TEXT NOT NULL DEFAULT '未命名资源' CHECK (char_length(trim(title)) BETWEEN 1 AND 120),
  original_filename TEXT,
  mime_type TEXT,
  byte_size BIGINT CHECK (byte_size IS NULL OR byte_size >= 0),
  width INTEGER CHECK (width IS NULL OR width > 0),
  height INTEGER CHECK (height IS NULL OR height > 0),
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  storage_state TEXT NOT NULL DEFAULT 'active'
    CHECK (storage_state IN ('pending', 'active', 'migration_pending', 'failed')),
  moderation_status TEXT NOT NULL DEFAULT 'allowed'
    CHECK (moderation_status IN ('allowed', 'hidden')),
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT resource_library_assets_source_shape_chk CHECK (
    (
      source_type = 'upload'
      AND source_generation_id IS NULL
      AND source_result_index IS NULL
      AND module_key IS NULL
    )
    OR
    (
      source_type = 'generation'
      AND source_result_index IS NOT NULL
      AND module_key IS NOT NULL
    )
  ),
  UNIQUE (user_id, origin_key)
);

CREATE INDEX IF NOT EXISTS resource_library_assets_user_source_saved_idx
  ON public.resource_library_assets (user_id, source_type, saved_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS resource_library_assets_user_module_media_saved_idx
  ON public.resource_library_assets (user_id, module_key, media_type, saved_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS resource_library_assets_generation_idx
  ON public.resource_library_assets (source_generation_id, source_result_index)
  WHERE source_generation_id IS NOT NULL;

ALTER TABLE public.resource_library_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own resource library assets"
  ON public.resource_library_assets;
CREATE POLICY "Users can view own resource library assets"
  ON public.resource_library_assets FOR SELECT
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own resource library assets"
  ON public.resource_library_assets;
CREATE POLICY "Users can insert own resource library assets"
  ON public.resource_library_assets FOR INSERT
  WITH CHECK (
    (select auth.uid()) = user_id
    AND (
      source_type = 'upload'
      OR EXISTS (
        SELECT 1
        FROM public.generations generation
        WHERE generation.id = source_generation_id
          AND generation.user_id = (select auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "Users can update own resource library assets"
  ON public.resource_library_assets;
CREATE POLICY "Users can update own resource library assets"
  ON public.resource_library_assets FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- Mutations are intentionally server-only. The API authenticates the caller,
-- derives generation/upload identity, then writes with the service role.
-- Supabase projects commonly grant broad default table privileges to anon and
-- authenticated. Revoke everything first so TRUNCATE/REFERENCES/TRIGGER cannot
-- bypass the intended API boundary (RLS does not protect TRUNCATE).
REVOKE ALL ON public.resource_library_assets FROM anon, authenticated;
GRANT SELECT ON public.resource_library_assets TO authenticated;

CREATE TABLE IF NOT EXISTS public.user_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 20),
  content TEXT NOT NULL CHECK (char_length(trim(content)) BETWEEN 1 AND 2000),
  creation_type TEXT NOT NULL CHECK (creation_type ~ '^[A-Za-z][A-Za-z0-9_-]{0,63}$'),
  module_key TEXT CHECK (module_key IS NULL OR module_key ~ '^[A-Za-z][A-Za-z0-9_-]{0,63}$'),
  tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[] CHECK (cardinality(tags) <= 10),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS user_prompts_user_updated_idx
  ON public.user_prompts (user_id, updated_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS user_prompts_user_creation_type_updated_idx
  ON public.user_prompts (user_id, creation_type, updated_at DESC, id DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.user_prompts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own prompts" ON public.user_prompts;
CREATE POLICY "Users can view own prompts"
  ON public.user_prompts FOR SELECT
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own prompts" ON public.user_prompts;
CREATE POLICY "Users can insert own prompts"
  ON public.user_prompts FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own prompts" ON public.user_prompts;
CREATE POLICY "Users can update own prompts"
  ON public.user_prompts FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

REVOKE ALL ON public.user_prompts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_prompts TO authenticated;

CREATE OR REPLACE FUNCTION public.touch_resource_library_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS resource_library_assets_touch_updated_at
  ON public.resource_library_assets;
CREATE TRIGGER resource_library_assets_touch_updated_at
  BEFORE UPDATE ON public.resource_library_assets
  FOR EACH ROW EXECUTE FUNCTION public.touch_resource_library_updated_at();

DROP TRIGGER IF EXISTS user_prompts_touch_updated_at ON public.user_prompts;
CREATE TRIGGER user_prompts_touch_updated_at
  BEFORE UPDATE ON public.user_prompts
  FOR EACH ROW EXECUTE FUNCTION public.touch_resource_library_updated_at();

REVOKE ALL ON FUNCTION public.touch_resource_library_updated_at()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_resource_library_facets()
RETURNS TABLE (
  source_type TEXT,
  module_key TEXT,
  media_type TEXT,
  view_kind TEXT,
  total BIGINT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    asset.source_type,
    asset.module_key,
    asset.media_type,
    CASE
      WHEN asset.media_type = 'video' THEN 'video'
      WHEN asset.group_key IS NOT NULL THEN 'group'
      ELSE 'single'
    END AS view_kind,
    count(*) AS total
  FROM public.resource_library_assets asset
  WHERE asset.user_id = (select auth.uid())
    AND asset.deleted_at IS NULL
    AND asset.moderation_status = 'allowed'
    AND asset.storage_state IN ('active', 'migration_pending')
  GROUP BY asset.source_type, asset.module_key, asset.media_type, view_kind
  ORDER BY asset.source_type, asset.module_key NULLS FIRST, asset.media_type, view_kind;
$$;

REVOKE ALL ON FUNCTION public.get_resource_library_facets() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_resource_library_facets() TO authenticated;
