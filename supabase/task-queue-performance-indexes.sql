-- Speeds up the task rail and top-right task queue badge.
-- Apply this in Supabase SQL Editor for existing databases.

CREATE INDEX IF NOT EXISTS generations_user_kind_created_idx
  ON public.generations (user_id, ((job_payload->>'kind')), created_at DESC);

CREATE INDEX IF NOT EXISTS generations_user_status_created_idx
  ON public.generations (user_id, status, created_at DESC);

-- History and task-rail reads exclude internal worker records. Keeping that
-- predicate in the index prevents JSONB filtering from turning an otherwise
-- user-scoped recent-history lookup into a slow scan.
CREATE INDEX IF NOT EXISTS generations_user_visible_created_idx
  ON public.generations (user_id, created_at DESC)
  WHERE (job_payload->>'internalTask') IS NULL;

