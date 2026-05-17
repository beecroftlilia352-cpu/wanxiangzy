-- Speeds up the task rail and top-right task queue badge.
-- Apply this in Supabase SQL Editor for existing databases.

CREATE INDEX IF NOT EXISTS generations_user_kind_created_idx
  ON public.generations (user_id, ((job_payload->>'kind')), created_at DESC);

CREATE INDEX IF NOT EXISTS generations_user_status_created_idx
  ON public.generations (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_workflows_user_status_created_idx
  ON public.agent_workflows (user_id, status, created_at DESC);
