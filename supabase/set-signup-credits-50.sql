-- ============================================================
-- 新注册用户默认积分改为 50
-- 在 Supabase SQL Editor 中运行
-- ============================================================

ALTER TABLE public.profiles
  ALTER COLUMN credits SET DEFAULT 50;

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

  INSERT INTO public.credit_logs (user_id, amount, balance, reason)
  VALUES (NEW.id, 50, 50, '注册赠送');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
