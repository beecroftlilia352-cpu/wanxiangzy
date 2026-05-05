-- ============================================================
-- Production Visual Agent Workflow Schema
-- Run after schema.sql, credits-update.sql, atomic-credit-rpc.sql, agent-conversations.sql.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.agent_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.agent_conversations(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('draft','planned','needs_confirmation','confirmed','queued','running','waiting_user','completed','partially_completed','failed','cancelled')),
  intent TEXT,
  summary TEXT,
  mode TEXT NOT NULL DEFAULT 'auto' CHECK (mode IN ('auto','chat','agent')),
  input_images JSONB NOT NULL DEFAULT '[]'::jsonb,
  active_plan_version_id UUID,
  final_outputs JSONB,
  cost_estimate JSONB,
  cost_reserved INTEGER NOT NULL DEFAULT 0,
  cost_settled INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_workflows_user_idempotency_idx
  ON public.agent_workflows(user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS agent_workflows_queue_idx
  ON public.agent_workflows(status, created_at)
  WHERE status IN ('queued','running');

CREATE TABLE IF NOT EXISTS public.agent_workflow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.agent_workflows(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','ready','queued','running','completed','failed','skipped','waiting_user','cancelled')),
  depends_on TEXT[] NOT NULL DEFAULT '{}',
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB,
  quality JSONB,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workflow_id, step_key)
);

CREATE INDEX IF NOT EXISTS agent_workflow_steps_workflow_idx
  ON public.agent_workflow_steps(workflow_id, status);

CREATE TABLE IF NOT EXISTS public.agent_workflow_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.agent_workflows(id) ON DELETE CASCADE,
  step_id UUID REFERENCES public.agent_workflow_steps(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  message TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_workflow_events_workflow_idx
  ON public.agent_workflow_events(workflow_id, created_at);

CREATE TABLE IF NOT EXISTS public.agent_plan_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES public.agent_workflows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('planner','validator','user_edit','system')),
  plan JSONB NOT NULL,
  validation JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workflow_id, version)
);

CREATE TABLE IF NOT EXISTS public.agent_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workflow_id UUID REFERENCES public.agent_workflows(id) ON DELETE SET NULL,
  step_id UUID REFERENCES public.agent_workflow_steps(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('image','video','3d_asset')),
  role TEXT NOT NULL CHECK (role IN ('source','intermediate','final')),
  url TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_assets_workflow_idx
  ON public.agent_assets(workflow_id, step_id, created_at);

CREATE TABLE IF NOT EXISTS public.agent_tool_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES public.agent_workflows(id) ON DELETE CASCADE,
  step_id UUID NOT NULL REFERENCES public.agent_workflow_steps(id) ON DELETE CASCADE,
  tool_type TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  request JSONB,
  response JSONB,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  error_message TEXT,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_credit_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES public.agent_workflows(id) ON DELETE CASCADE,
  amount_reserved INTEGER NOT NULL,
  amount_settled INTEGER NOT NULL DEFAULT 0,
  amount_released INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','settled','released','partially_released')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workflow_id)
);

CREATE TABLE IF NOT EXISTS public.agent_user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_workflow_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_workflow_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_plan_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_tool_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_credit_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own workflows" ON public.agent_workflows;
CREATE POLICY "Users can manage own workflows"
  ON public.agent_workflows FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own workflow steps" ON public.agent_workflow_steps;
CREATE POLICY "Users can view own workflow steps"
  ON public.agent_workflow_steps FOR SELECT
  USING (workflow_id IN (SELECT id FROM public.agent_workflows WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can view own workflow events" ON public.agent_workflow_events;
CREATE POLICY "Users can view own workflow events"
  ON public.agent_workflow_events FOR SELECT
  USING (workflow_id IN (SELECT id FROM public.agent_workflows WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can view own plan versions" ON public.agent_plan_versions;
CREATE POLICY "Users can view own plan versions"
  ON public.agent_plan_versions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own assets" ON public.agent_assets;
CREATE POLICY "Users can view own assets"
  ON public.agent_assets FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own tool runs" ON public.agent_tool_runs;
CREATE POLICY "Users can view own tool runs"
  ON public.agent_tool_runs FOR SELECT
  USING (workflow_id IN (SELECT id FROM public.agent_workflows WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can view own credit reservations" ON public.agent_credit_reservations;
CREATE POLICY "Users can view own credit reservations"
  ON public.agent_credit_reservations FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can manage own preferences" ON public.agent_user_preferences;
CREATE POLICY "Users can manage own preferences"
  ON public.agent_user_preferences FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.reserve_agent_workflow_credits(
  p_user_id UUID,
  p_workflow_id UUID,
  p_amount INTEGER,
  p_reason TEXT DEFAULT 'Agent workflow credit reservation'
)
RETURNS TABLE(credits_remaining INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  IF p_amount <= 0 THEN
    SELECT credits INTO v_balance FROM public.profiles WHERE id = p_user_id;
    RETURN QUERY SELECT COALESCE(v_balance, 0);
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.agent_credit_reservations WHERE workflow_id = p_workflow_id) THEN
    SELECT credits INTO v_balance FROM public.profiles WHERE id = p_user_id;
    RETURN QUERY SELECT COALESCE(v_balance, 0);
    RETURN;
  END IF;

  UPDATE public.profiles
    SET credits = credits - p_amount,
        total_credits_used = COALESCE(total_credits_used, 0) + p_amount,
        updated_at = now()
    WHERE id = p_user_id
      AND credits >= p_amount
    RETURNING credits INTO v_balance;

  IF v_balance IS NULL THEN
    SELECT credits INTO v_balance FROM public.profiles WHERE id = p_user_id;
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS:%', COALESCE(v_balance, 0) USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.agent_credit_reservations(user_id, workflow_id, amount_reserved, status)
  VALUES (p_user_id, p_workflow_id, p_amount, 'reserved');

  UPDATE public.agent_workflows
    SET cost_reserved = p_amount,
        updated_at = now()
    WHERE id = p_workflow_id
      AND user_id = p_user_id;

  INSERT INTO public.credit_logs(user_id, amount, balance, reason)
  VALUES (p_user_id, -p_amount, v_balance, p_reason);

  RETURN QUERY SELECT v_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_agent_workflow_credits(UUID, UUID, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_agent_workflow_credits(UUID, UUID, INTEGER, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.release_agent_workflow_credits(
  p_user_id UUID,
  p_workflow_id UUID,
  p_amount INTEGER,
  p_reason TEXT DEFAULT 'Agent workflow credit release'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance INTEGER;
  v_reserved INTEGER;
  v_released INTEGER;
  v_settled INTEGER;
  v_release INTEGER;
BEGIN
  SELECT amount_reserved, amount_released, amount_settled
    INTO v_reserved, v_released, v_settled
  FROM public.agent_credit_reservations
  WHERE workflow_id = p_workflow_id AND user_id = p_user_id
  FOR UPDATE;

  IF v_reserved IS NULL THEN
    SELECT credits INTO v_balance FROM public.profiles WHERE id = p_user_id;
    RETURN COALESCE(v_balance, 0);
  END IF;

  v_release := LEAST(GREATEST(p_amount, 0), GREATEST(v_reserved - v_released - v_settled, 0));

  IF v_release > 0 THEN
    UPDATE public.profiles
      SET credits = credits + v_release,
          updated_at = now()
      WHERE id = p_user_id
      RETURNING credits INTO v_balance;

    INSERT INTO public.credit_logs(user_id, amount, balance, reason)
    VALUES (p_user_id, v_release, v_balance, p_reason);
  ELSE
    SELECT credits INTO v_balance FROM public.profiles WHERE id = p_user_id;
  END IF;

  UPDATE public.agent_credit_reservations
    SET amount_released = amount_released + v_release,
        status = CASE
          WHEN amount_settled + amount_released + v_release >= amount_reserved THEN 'released'
          ELSE 'partially_released'
        END,
        updated_at = now()
    WHERE workflow_id = p_workflow_id AND user_id = p_user_id;

  RETURN COALESCE(v_balance, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.release_agent_workflow_credits(UUID, UUID, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_agent_workflow_credits(UUID, UUID, INTEGER, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.settle_agent_workflow_credits(
  p_user_id UUID,
  p_workflow_id UUID,
  p_amount INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reserved INTEGER;
BEGIN
  SELECT amount_reserved INTO v_reserved
  FROM public.agent_credit_reservations
  WHERE workflow_id = p_workflow_id AND user_id = p_user_id
  FOR UPDATE;

  IF v_reserved IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.agent_credit_reservations
    SET amount_settled = LEAST(amount_reserved - amount_released, GREATEST(p_amount, 0)),
        status = CASE
          WHEN LEAST(amount_reserved - amount_released, GREATEST(p_amount, 0)) + amount_released >= amount_reserved THEN 'settled'
          ELSE status
        END,
        updated_at = now()
    WHERE workflow_id = p_workflow_id AND user_id = p_user_id;

  UPDATE public.agent_workflows
    SET cost_settled = LEAST(cost_reserved, GREATEST(p_amount, 0)),
        updated_at = now()
    WHERE id = p_workflow_id AND user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_agent_workflow_credits(UUID, UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_agent_workflow_credits(UUID, UUID, INTEGER) TO service_role;

CREATE OR REPLACE FUNCTION public.claim_next_agent_workflows(
  p_limit INTEGER DEFAULT 2,
  p_stale_after INTERVAL DEFAULT '10 minutes'
)
RETURNS TABLE(id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT w.id
    FROM public.agent_workflows w
    WHERE w.status = 'queued'
       OR (w.status = 'running' AND w.updated_at < now() - p_stale_after)
    ORDER BY w.created_at ASC
    LIMIT LEAST(GREATEST(p_limit, 1), 10)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.agent_workflows w
    SET status = 'running',
        updated_at = now()
    FROM candidates
    WHERE w.id = candidates.id
    RETURNING w.id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_next_agent_workflows(INTEGER, INTERVAL) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_next_agent_workflows(INTEGER, INTERVAL) TO service_role;
