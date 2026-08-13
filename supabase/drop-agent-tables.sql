-- Drop the retired "agent" module database objects.
-- The agent module was extracted to refactor/extract-agent-module and is no longer used.
-- Run this once in the Supabase SQL editor to remove the tables + functions and
-- the task-queue read-model coupling that pointed at agent_workflows.

-- 1) Remove task-queue read-model coupling to agent_workflows.
DROP TRIGGER IF EXISTS agent_workflows_task_queue_items_sync ON public.agent_workflows;
DROP FUNCTION IF EXISTS public.task_queue_sync_workflow_trigger() CASCADE;
DROP FUNCTION IF EXISTS public.task_queue_upsert_workflow(public.agent_workflows) CASCADE;
DELETE FROM public.task_queue_items WHERE source_type = 'workflow';

-- 2) Drop agent credit/queue RPC functions.
DROP FUNCTION IF EXISTS public.reserve_agent_workflow_credits(UUID, UUID, INTEGER, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.release_agent_workflow_credits(UUID, UUID, INTEGER, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.settle_agent_workflow_credits(UUID, UUID, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS public.claim_next_agent_workflows(INTEGER, INTERVAL) CASCADE;

-- 3) Drop agent tables.
DROP TABLE IF EXISTS public.agent_eval_results CASCADE;
DROP TABLE IF EXISTS public.agent_eval_runs CASCADE;
DROP TABLE IF EXISTS public.agent_credit_reservations CASCADE;
DROP TABLE IF EXISTS public.agent_workflow_events CASCADE;
DROP TABLE IF EXISTS public.agent_workflow_steps CASCADE;
DROP TABLE IF EXISTS public.agent_plan_versions CASCADE;
DROP TABLE IF EXISTS public.agent_assets CASCADE;
DROP TABLE IF EXISTS public.agent_user_preferences CASCADE;
DROP TABLE IF EXISTS public.agent_workflows CASCADE;
DROP TABLE IF EXISTS public.agent_tool_runs CASCADE;
DROP TABLE IF EXISTS public.agent_knowledge_items CASCADE;
DROP TABLE IF EXISTS public.agent_observability_events CASCADE;
DROP TABLE IF EXISTS public.agent_feedback CASCADE;
DROP TABLE IF EXISTS public.agent_brain_traces CASCADE;
DROP TABLE IF EXISTS public.agent_messages CASCADE;
DROP TABLE IF EXISTS public.agent_conversations CASCADE;
