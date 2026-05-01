-- ============================================================
-- 积分系统更新 — 在 Supabase SQL Editor 中运行
-- ============================================================

-- 给 generations 表添加积分字段
ALTER TABLE public.generations
  ADD COLUMN IF NOT EXISTS model_face_url TEXT,
  ADD COLUMN IF NOT EXISTS reference_url TEXT,
  ADD COLUMN IF NOT EXISTS credits_cost INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS ai_model TEXT DEFAULT 'gpt-image-2',
  ADD COLUMN IF NOT EXISTS image_size TEXT DEFAULT '1K';

-- 给 profiles 表添加积分历史相关字段
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS total_credits_used INTEGER DEFAULT 0;

-- 积分变动记录表
CREATE TABLE IF NOT EXISTS public.credit_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount     INTEGER NOT NULL,  -- 正数=充值, 负数=消耗
  balance    INTEGER NOT NULL,  -- 变动后余额
  reason     TEXT NOT NULL,
  generation_id UUID REFERENCES public.generations(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own credit logs"
  ON public.credit_logs FOR SELECT
  USING (auth.uid() = user_id);

-- 注册时赠送 50 积分 (更新 trigger)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, credits, total_credits_used)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    50,
    0
  );

  -- 记录积分变动
  INSERT INTO public.credit_logs (user_id, amount, balance, reason)
  VALUES (NEW.id, 50, 50, '注册赠送');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
