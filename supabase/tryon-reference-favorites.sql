-- Try-on reference favorites stored per user.
CREATE TABLE IF NOT EXISTS public.tryon_reference_favorites (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  label      TEXT NOT NULL CHECK (char_length(trim(label)) > 0 AND char_length(label) <= 40),
  category   TEXT NOT NULL DEFAULT 'scene' CHECK (category IN ('scene', 'style', 'pose')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, url)
);

CREATE INDEX IF NOT EXISTS tryon_reference_favorites_user_updated_idx
  ON public.tryon_reference_favorites(user_id, updated_at DESC);

ALTER TABLE public.tryon_reference_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own tryon reference favorites"
  ON public.tryon_reference_favorites;

CREATE POLICY "Users can manage own tryon reference favorites"
  ON public.tryon_reference_favorites FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
