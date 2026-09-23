-- ============================================================================
-- 共享提示词词库（public.prompt_library_items）
-- ============================================================================
--
-- 为什么要新建一张表，而不是复用 public.user_prompts？
--   user_prompts 是「资源库 / 我的提示词」的私有表，它的 SELECT 策略只允许本人读取
--   （见 supabase/resource-library.sql → "Users can view own prompts"）。本需求要的是
--   「局域网内所有已登录用户都能看到已保存的条目」这种共享可见性模型；放开 user_prompts
--   的 SELECT 策略会直接改变既有功能的可见性语义，属于破坏性改动，因此这里新建一张
--   独立表：读写边界、索引、策略全部自带，既有表/功能零影响。
--
-- 可见性模型（本文件的核心语义变化）：
--   SELECT ：所有已登录用户可读「未删除」的条目 —— 这就是共享词库。
--            USING (deleted_at IS NULL AND auth.uid() IS NOT NULL)
--   INSERT ：仅限本人写入，且 created_by 必须等于 auth.uid()。
--   UPDATE ：仅限本人（改自己的条目）。
--   DELETE ：仅限本人（RLS 层面兜底；接口只做软删除，且未授予 DELETE 权限）。
--   管理员后台：走 service role key，绕过 RLS，由 /api/admin/prompt-library/* 在
--   接口层做权限校验并写入 public.admin_audit_logs。
--
-- created_by 采用 ON DELETE SET NULL：某个用户被删除后，他贡献到共享词库的条目
-- 应当继续对其他人可见（保留 created_by_email 作为展示用的作者标识），而不是连锁消失。
--
-- 幂等性：CREATE TABLE/INDEX IF NOT EXISTS、DROP POLICY IF EXISTS + CREATE POLICY、
-- CREATE OR REPLACE FUNCTION、DROP TRIGGER IF EXISTS + CREATE TRIGGER，可重复执行。
-- 本文件只做新增（新表/新索引/新策略/新触发器/新函数），不改动任何既有对象。
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.prompt_library_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 20),
  content TEXT NOT NULL CHECK (char_length(trim(content)) BETWEEN 1 AND 2000),
  creation_type TEXT NOT NULL DEFAULT 'general-image'
    CHECK (creation_type ~ '^[A-Za-z][A-Za-z0-9_-]{0,63}$'),
  module_key TEXT CHECK (module_key IS NULL OR module_key ~ '^[A-Za-z][A-Za-z0-9_-]{0,63}$'),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_email TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- 共享列表的主查询形态：WHERE deleted_at IS NULL ORDER BY created_at DESC, id DESC LIMIT n
CREATE INDEX IF NOT EXISTS prompt_library_items_created_at_idx
  ON public.prompt_library_items (created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

-- 「我保存的」过滤（scope=mine）
CREATE INDEX IF NOT EXISTS prompt_library_items_created_by_idx
  ON public.prompt_library_items (created_by, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

-- 按创作类型过滤（图生图 / 文生图 …）
CREATE INDEX IF NOT EXISTS prompt_library_items_creation_type_idx
  ON public.prompt_library_items (creation_type, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

-- 关键词检索（title/content ILIKE '%q%'）无法使用 btree，依赖 pg_trgm 的 GIN 索引。
-- pg_trgm 在 Supabase 上通常可直接创建；若当前角色无权安装扩展，则跳过索引而不是让整份
-- 迁移失败（此时检索仍可用，只是走顺序扫描）。
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'prompt_library_items: pg_trgm unavailable, skipping trigram index (%)', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE INDEX IF NOT EXISTS prompt_library_items_search_trgm_idx
      ON public.prompt_library_items USING gin ((coalesce(title, '') || ' ' || coalesce(content, '')) gin_trgm_ops)
      WHERE deleted_at IS NULL;
  ELSE
    RAISE NOTICE 'prompt_library_items: pg_trgm not installed, trigram index skipped';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'prompt_library_items: trigram index skipped (%)', SQLERRM;
END $$;

ALTER TABLE public.prompt_library_items ENABLE ROW LEVEL SECURITY;

-- 共享读：任何已登录用户都能读到所有未删除条目。
-- 注意这里与 user_prompts 的 "Users can view own prompts" 语义不同，是刻意为之：
-- 词库的可见性模型就是「局域网内共享」。
DROP POLICY IF EXISTS "Prompt library items are readable by any authenticated user"
  ON public.prompt_library_items;
CREATE POLICY "Prompt library items are readable by any authenticated user"
  ON public.prompt_library_items FOR SELECT
  USING (deleted_at IS NULL AND (SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "Users can insert their own prompt library items"
  ON public.prompt_library_items;
CREATE POLICY "Users can insert their own prompt library items"
  ON public.prompt_library_items FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = created_by);

DROP POLICY IF EXISTS "Users can update their own prompt library items"
  ON public.prompt_library_items;
CREATE POLICY "Users can update their own prompt library items"
  ON public.prompt_library_items FOR UPDATE
  USING ((SELECT auth.uid()) = created_by)
  WITH CHECK ((SELECT auth.uid()) = created_by);

DROP POLICY IF EXISTS "Users can delete their own prompt library items"
  ON public.prompt_library_items;
CREATE POLICY "Users can delete their own prompt library items"
  ON public.prompt_library_items FOR DELETE
  USING ((SELECT auth.uid()) = created_by);

-- 与 resource-library.sql 一致：Supabase 会给新表套用较宽的默认权限，先全部回收，
-- 再只授予 SELECT/INSERT/UPDATE。刻意不授予 DELETE —— 业务只做软删除（写 deleted_at）。
REVOKE ALL ON public.prompt_library_items FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.prompt_library_items TO authenticated;

-- updated_at 自动维护。自建函数，不复用 resource-library 的
-- touch_resource_library_updated_at()，避免与既有功能产生隐式依赖。
CREATE OR REPLACE FUNCTION public.touch_prompt_library_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prompt_library_items_touch_updated_at ON public.prompt_library_items;
CREATE TRIGGER prompt_library_items_touch_updated_at
  BEFORE UPDATE ON public.prompt_library_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_prompt_library_updated_at();

REVOKE ALL ON FUNCTION public.touch_prompt_library_updated_at()
  FROM PUBLIC, anon, authenticated;

COMMIT;
