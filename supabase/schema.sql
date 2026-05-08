-- ============================================================
-- AI Try-On — Supabase Database Schema
-- 在 Supabase SQL Editor 中运行此文件来初始化数据库
-- ============================================================

-- 用户扩展资料
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  display_name TEXT,
  avatar_url  TEXT,
  credits     INTEGER NOT NULL DEFAULT 50,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- 自动创建 profile（注册时触发）
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, credits)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)), 50);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 预设模特表
-- ============================================================
CREATE TABLE public.models (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  image_url  TEXT NOT NULL,
  gender     TEXT NOT NULL CHECK (gender IN ('male', 'female', 'unisex')),
  is_preset  BOOLEAN NOT NULL DEFAULT true,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.models ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view preset models"
  ON public.models FOR SELECT
  USING (is_preset = true OR auth.uid() = user_id);

-- ============================================================
-- 参考图库表
-- ============================================================
CREATE TABLE public.reference_images (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url        TEXT NOT NULL,
  label      TEXT NOT NULL,
  category   TEXT NOT NULL CHECK (category IN ('pose', 'scene', 'style')),
  is_preset  BOOLEAN NOT NULL DEFAULT true,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.reference_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view preset references"
  ON public.reference_images FOR SELECT
  USING (is_preset = true OR auth.uid() = user_id);

-- ============================================================
-- 生成历史表
-- ============================================================
CREATE TABLE public.generations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clothing_urls  TEXT[] NOT NULL DEFAULT '{}',
  model_face_url TEXT,
  reference_url  TEXT,
  result_urls    TEXT[] NOT NULL DEFAULT '{}',
  status         TEXT NOT NULL DEFAULT 'uploading'
                   CHECK (status IN ('uploading','queued','processing_tryon','processing_face_swap','completed','failed')),
  error_message  TEXT,
  credits_used   INTEGER NOT NULL DEFAULT 1,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at   TIMESTAMPTZ
);

ALTER TABLE public.generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own generations"
  ON public.generations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own generations"
  ON public.generations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 商品套图收藏方案表
-- ============================================================
CREATE TABLE public.product_set_favorite_plans (
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

CREATE INDEX product_set_favorite_plans_user_updated_idx
  ON public.product_set_favorite_plans(user_id, updated_at DESC);

ALTER TABLE public.product_set_favorite_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own product set favorite plans"
  ON public.product_set_favorite_plans FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- Storage Buckets（在 Supabase Dashboard 中手动创建）
-- ============================================================
-- 1. clothing   — 用户上传的衣服图片
-- 2. models     — 模特头像
-- 3. references — 参考图
-- 4. results    — 生成的换装结果图
-- 每个 bucket 均设为 public read

-- 创建 bucket 的 SQL（也可以在 Dashboard 操作）:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('clothing', 'clothing', true);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('models', 'models', true);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('references', 'references', true);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('results', 'results', true);

-- Storage RLS: authenticated users can upload, everyone can read
-- CREATE POLICY "Public read clothing" ON storage.objects FOR SELECT USING (bucket_id = 'clothing');
-- CREATE POLICY "Auth upload clothing" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'clothing' AND auth.role() = 'authenticated');
-- (同样规则适用于 models, references, results)
