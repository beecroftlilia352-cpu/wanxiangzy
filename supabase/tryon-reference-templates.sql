-- Multi-reference templates for try-on scene/reference selections.
CREATE TABLE IF NOT EXISTS public.tryon_reference_templates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL CHECK (char_length(trim(name)) > 0 AND char_length(name) <= 60),
  reference_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  cover_url  TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(reference_items) = 'array'),
  CHECK (jsonb_array_length(reference_items) BETWEEN 1 AND 8)
);

CREATE INDEX IF NOT EXISTS tryon_reference_templates_user_updated_idx
  ON public.tryon_reference_templates(user_id, updated_at DESC);

ALTER TABLE public.tryon_reference_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own tryon reference templates"
  ON public.tryon_reference_templates;

CREATE POLICY "Users can manage own tryon reference templates"
  ON public.tryon_reference_templates FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
