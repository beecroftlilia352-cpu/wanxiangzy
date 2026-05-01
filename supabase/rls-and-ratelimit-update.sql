-- ============================================================
-- RLS 策略补全 — 在 Supabase SQL Editor 中运行
-- 补充 models / reference_images / generations 缺失的写入策略
-- ============================================================

-- models 表：用户可增删改自己的模特
CREATE POLICY "Users can insert own models"
  ON public.models FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own models"
  ON public.models FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own models"
  ON public.models FOR DELETE
  USING (auth.uid() = user_id);

-- reference_images 表：用户可增删改自己的参考图
CREATE POLICY "Users can insert own references"
  ON public.reference_images FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own references"
  ON public.reference_images FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own references"
  ON public.reference_images FOR DELETE
  USING (auth.uid() = user_id);

-- generations 表：禁止客户端直接更新（service_role 绕过 RLS）
CREATE POLICY "No client update on generations"
  ON public.generations FOR UPDATE
  USING (false);

-- generations 表：用户可删除自己的记录
CREATE POLICY "Users can delete own generations"
  ON public.generations FOR DELETE
  USING (auth.uid() = user_id);

-- 索引优化
CREATE INDEX IF NOT EXISTS generations_user_created_idx
  ON public.generations (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS credit_logs_user_created_idx
  ON public.credit_logs (user_id, created_at DESC);

-- ============================================================
-- 限流器表和 RPC
-- ============================================================
CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  key        TEXT PRIMARY KEY,
  count      INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key TEXT,
  p_limit INTEGER,
  p_window_start TIMESTAMPTZ,
  p_now TIMESTAMPTZ,
  p_window_ms INTEGER
)
RETURNS TABLE(allowed BOOLEAN, retry_after_ms INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_window_start TIMESTAMPTZ;
BEGIN
  SELECT count, window_start INTO v_count, v_window_start
  FROM public.rate_limit_buckets
  WHERE key = p_key
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.rate_limit_buckets (key, count, window_start, updated_at)
    VALUES (p_key, 1, p_now, p_now);
    RETURN QUERY SELECT true, 0;
    RETURN;
  END IF;

  IF v_window_start < p_window_start THEN
    UPDATE public.rate_limit_buckets
    SET count = 1, window_start = p_now, updated_at = p_now
    WHERE key = p_key;
    RETURN QUERY SELECT true, 0;
    RETURN;
  END IF;

  IF v_count >= p_limit THEN
    RETURN QUERY SELECT false, EXTRACT(EPOCH FROM (v_window_start + (p_window_ms || ' milliseconds')::interval - p_now)) * 1000;
    RETURN;
  END IF;

  UPDATE public.rate_limit_buckets
  SET count = count + 1, updated_at = p_now
  WHERE key = p_key;
  RETURN QUERY SELECT true, 0;
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) TO service_role;

-- 自动清理过期的限流记录
CREATE OR REPLACE FUNCTION public.cleanup_rate_limit_buckets()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  DELETE FROM public.rate_limit_buckets
  WHERE updated_at < now() - interval '10 minutes';
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_rate_limit_buckets() TO service_role;
