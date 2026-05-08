-- 商品套图收藏方案
CREATE TABLE IF NOT EXISTS public.product_set_favorite_plans (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL CHECK (char_length(trim(name)) > 0 AND char_length(name) <= 40),
  mode                  TEXT NOT NULL DEFAULT 'smart' CHECK (mode IN ('smart', 'custom')),
  image_type            TEXT NOT NULL DEFAULT 'main' CHECK (image_type IN ('main', 'details')),
  gen_count             INTEGER NOT NULL DEFAULT 3 CHECK (gen_count >= 1 AND gen_count <= 8),
  settings              JSONB NOT NULL DEFAULT '{}'::jsonb,
  selected_template_ids INTEGER[] NOT NULL DEFAULT '{}',
  custom_templates      JSONB NOT NULL DEFAULT '[]'::jsonb,
  module_overrides      JSONB NOT NULL DEFAULT '[]'::jsonb,
  ai_model              TEXT NOT NULL DEFAULT 'gpt-image-2',
  aspect_ratio          TEXT NOT NULL DEFAULT '3:4',
  image_size            TEXT NOT NULL DEFAULT '1K',
  quality_mode          TEXT NOT NULL DEFAULT 'standard' CHECK (quality_mode IN ('standard', 'advanced')),
  plan_preview          JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS product_set_favorite_plans_user_updated_idx
  ON public.product_set_favorite_plans(user_id, updated_at DESC);

ALTER TABLE public.product_set_favorite_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own product set favorite plans" ON public.product_set_favorite_plans;
CREATE POLICY "Users can manage own product set favorite plans"
  ON public.product_set_favorite_plans FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
