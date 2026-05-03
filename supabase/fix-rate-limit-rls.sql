-- ============================================================
-- 修复 rate_limit_buckets 表的 RLS 警告
-- 该表仅由 service_role（服务端 RPC）访问，客户端不得触碰
-- 在 Supabase SQL Editor 中运行此文件
-- ============================================================

-- 1. 启用 RLS
ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;

-- 2. 禁止所有客户端访问（service_role 绕过 RLS，不受影响）
CREATE POLICY "Deny all client access to rate_limit_buckets"
  ON public.rate_limit_buckets
  AS RESTRICTIVE
  FOR ALL
  TO authenticated, anon
  USING (false);
