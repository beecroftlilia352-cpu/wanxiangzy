-- Agent Brain v2 decision traces.
-- Run after agent-conversations.sql. Safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.agent_brain_traces (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.agent_conversations(id) ON DELETE SET NULL,
  message_excerpt TEXT,
  action TEXT NOT NULL CHECK (action IN ('chat','generate','clarify')),
  module TEXT,
  confidence NUMERIC NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'llm',
  trace JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_brain_traces_user_idx
  ON public.agent_brain_traces(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_brain_traces_conversation_idx
  ON public.agent_brain_traces(conversation_id, created_at DESC);

ALTER TABLE public.agent_brain_traces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own brain traces" ON public.agent_brain_traces;
CREATE POLICY "Users can view own brain traces"
  ON public.agent_brain_traces FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own brain traces" ON public.agent_brain_traces;
CREATE POLICY "Users can insert own brain traces"
  ON public.agent_brain_traces FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.agent_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.agent_conversations(id) ON DELETE SET NULL,
  message_id UUID,
  trace_id UUID REFERENCES public.agent_brain_traces(id) ON DELETE SET NULL,
  rating TEXT NOT NULL CHECK (rating IN ('good','bad')),
  reason TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  feedback JSONB NOT NULL DEFAULT '{}'::jsonb,
  eval_case JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_feedback_user_idx
  ON public.agent_feedback(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_feedback_trace_idx
  ON public.agent_feedback(trace_id, created_at DESC);

ALTER TABLE public.agent_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own agent feedback" ON public.agent_feedback;
CREATE POLICY "Users can view own agent feedback"
  ON public.agent_feedback FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own agent feedback" ON public.agent_feedback;
CREATE POLICY "Users can insert own agent feedback"
  ON public.agent_feedback FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.agent_observability_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.agent_conversations(id) ON DELETE SET NULL,
  trace_id UUID REFERENCES public.agent_brain_traces(id) ON DELETE SET NULL,
  event TEXT NOT NULL,
  route TEXT,
  ok BOOLEAN NOT NULL DEFAULT TRUE,
  latency_ms INTEGER,
  confidence NUMERIC,
  module TEXT,
  action TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_observability_events_user_idx
  ON public.agent_observability_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS agent_observability_events_event_idx
  ON public.agent_observability_events(event, created_at DESC);

ALTER TABLE public.agent_observability_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own agent observability events" ON public.agent_observability_events;
CREATE POLICY "Users can view own agent observability events"
  ON public.agent_observability_events FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role can insert agent observability events" ON public.agent_observability_events;
CREATE POLICY "Service role can insert agent observability events"
  ON public.agent_observability_events FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.agent_knowledge_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.agent_conversations(id) ON DELETE SET NULL,
  scope TEXT NOT NULL DEFAULT 'project' CHECK (scope IN ('global','brand','project','conversation')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  priority INTEGER NOT NULL DEFAULT 1,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_knowledge_items_user_idx
  ON public.agent_knowledge_items(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS agent_knowledge_items_scope_idx
  ON public.agent_knowledge_items(user_id, scope, priority DESC);

ALTER TABLE public.agent_knowledge_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own agent knowledge" ON public.agent_knowledge_items;
CREATE POLICY "Users can view own agent knowledge"
  ON public.agent_knowledge_items FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own agent knowledge" ON public.agent_knowledge_items;
CREATE POLICY "Users can insert own agent knowledge"
  ON public.agent_knowledge_items FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own agent knowledge" ON public.agent_knowledge_items;
CREATE POLICY "Users can update own agent knowledge"
  ON public.agent_knowledge_items FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.agent_eval_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total INTEGER NOT NULL DEFAULT 0,
  passed INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  score INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_eval_runs_user_idx
  ON public.agent_eval_runs(user_id, created_at DESC);

ALTER TABLE public.agent_eval_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own agent eval runs" ON public.agent_eval_runs;
CREATE POLICY "Users can view own agent eval runs"
  ON public.agent_eval_runs FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own agent eval runs" ON public.agent_eval_runs;
CREATE POLICY "Users can insert own agent eval runs"
  ON public.agent_eval_runs FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.agent_eval_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.agent_eval_runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  case_id TEXT NOT NULL,
  title TEXT NOT NULL,
  ok BOOLEAN NOT NULL DEFAULT FALSE,
  failures TEXT[] NOT NULL DEFAULT '{}',
  action TEXT,
  module TEXT,
  confidence NUMERIC,
  trace_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_eval_results_run_idx
  ON public.agent_eval_results(run_id, created_at ASC);

CREATE INDEX IF NOT EXISTS agent_eval_results_user_idx
  ON public.agent_eval_results(user_id, created_at DESC);

ALTER TABLE public.agent_eval_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own agent eval results" ON public.agent_eval_results;
CREATE POLICY "Users can view own agent eval results"
  ON public.agent_eval_results FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own agent eval results" ON public.agent_eval_results;
CREATE POLICY "Users can insert own agent eval results"
  ON public.agent_eval_results FOR INSERT
  WITH CHECK (user_id = auth.uid());
