-- 修复 rate_limit_buckets 的 PK 竞争
-- 原 check_rate_limit 在行不存在时用 SELECT FOR UPDATE 然后 INSERT：
--   SELECT ... FOR UPDATE WHERE key = X
--   IF NOT FOUND THEN INSERT ...
-- 行不存在时 FOR UPDATE 不会锁任何东西，两个并发请求都走 NOT FOUND 分支，
-- 第二个 INSERT 就触发 unique constraint "rate_limit_buckets_pkey"。
-- 改为单条 INSERT ... ON CONFLICT DO UPDATE，原子的 upsert 彻底消除竞争。

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
  INSERT INTO public.rate_limit_buckets (key, count, window_start, updated_at)
  VALUES (p_key, 1, p_now, p_now)
  ON CONFLICT (key) DO UPDATE
  SET
    -- 窗口已过期 → 重置为 1 + 新窗口起始
    -- 已达到上限 → 保持当前 count（避免无限增长）
    -- 否则 → 累加
    count = CASE
      WHEN rate_limit_buckets.window_start < p_window_start THEN 1
      WHEN rate_limit_buckets.count >= p_limit THEN rate_limit_buckets.count
      ELSE rate_limit_buckets.count + 1
    END,
    window_start = CASE
      WHEN rate_limit_buckets.window_start < p_window_start THEN p_now
      ELSE rate_limit_buckets.window_start
    END,
    updated_at = p_now
  RETURNING rate_limit_buckets.count, rate_limit_buckets.window_start
  INTO v_count, v_window_start;

  IF v_count >= p_limit THEN
    RETURN QUERY SELECT false, EXTRACT(EPOCH FROM (v_window_start + (p_window_ms || ' milliseconds')::interval - p_now)) * 1000;
  ELSE
    RETURN QUERY SELECT true, 0;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER) TO service_role;