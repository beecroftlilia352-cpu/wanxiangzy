-- Admin console foundation.
-- Run this in Supabase SQL editor before enabling non-bootstrap admins.
-- Bootstrap access can be granted temporarily with ADMIN_BOOTSTRAP_EMAILS.

CREATE TABLE IF NOT EXISTS public.admin_members (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE,
  role TEXT NOT NULL DEFAULT 'viewer'
    CHECK (role IN ('owner', 'ops', 'support', 'finance', 'reviewer', 'engineer', 'viewer')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  display_name TEXT,
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_members_email_idx
  ON public.admin_members (LOWER(email));

CREATE INDEX IF NOT EXISTS admin_members_role_status_idx
  ON public.admin_members (role, status);

ALTER TABLE public.admin_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email TEXT,
  actor_role TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_audit_logs_created_idx
  ON public.admin_audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS admin_audit_logs_actor_idx
  ON public.admin_audit_logs (actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS admin_audit_logs_resource_idx
  ON public.admin_audit_logs (resource_type, resource_id, created_at DESC);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.admin_config_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS admin_config_versions_key_status_idx
  ON public.admin_config_versions (config_key, status, created_at DESC);

ALTER TABLE public.admin_config_versions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.moderation_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  action TEXT NOT NULL
    CHECK (action IN ('hide', 'pass', 'escalate')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved', 'rejected')),
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS moderation_cases_source_idx
  ON public.moderation_cases (source_type, source_id, created_at DESC);

CREATE INDEX IF NOT EXISTS moderation_cases_status_created_idx
  ON public.moderation_cases (status, created_at DESC);

ALTER TABLE public.moderation_cases ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.touch_admin_member_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS admin_members_touch_updated_at ON public.admin_members;
CREATE TRIGGER admin_members_touch_updated_at
  BEFORE UPDATE ON public.admin_members
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_admin_member_updated_at();

CREATE OR REPLACE FUNCTION public.admin_adjust_user_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_reason TEXT,
  p_actor_user_id UUID,
  p_actor_email TEXT DEFAULT NULL,
  p_actor_role TEXT DEFAULT NULL
)
RETURNS TABLE(user_id UUID, balance INTEGER, amount INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance INTEGER;
  v_reason TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required';
  END IF;

  IF COALESCE(p_amount, 0) = 0 THEN
    RAISE EXCEPTION 'amount must not be zero';
  END IF;

  v_reason := LEFT(COALESCE(NULLIF(TRIM(p_reason), ''), 'admin manual adjustment'), 240);

  UPDATE public.profiles
  SET
    credits = GREATEST(COALESCE(credits, 0) + p_amount, 0),
    total_credits_used = CASE
      WHEN p_amount < 0 THEN COALESCE(total_credits_used, 0) + ABS(p_amount)
      ELSE COALESCE(total_credits_used, 0)
    END,
    updated_at = NOW()
  WHERE id = p_user_id
  RETURNING credits INTO v_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile not found';
  END IF;

  INSERT INTO public.credit_logs(user_id, amount, balance, reason)
  VALUES (p_user_id, p_amount, v_balance, CONCAT('admin: ', v_reason));

  INSERT INTO public.admin_audit_logs(
    actor_user_id,
    actor_email,
    actor_role,
    action,
    resource_type,
    resource_id,
    reason,
    metadata
  )
  VALUES (
    p_actor_user_id,
    p_actor_email,
    p_actor_role,
    'credits.adjust',
    'profile',
    p_user_id::TEXT,
    v_reason,
    jsonb_build_object('amount', p_amount, 'balance', v_balance)
  );

  RETURN QUERY SELECT p_user_id, v_balance, p_amount;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_adjust_user_credits(UUID, INTEGER, TEXT, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_adjust_user_credits(UUID, INTEGER, TEXT, UUID, TEXT, TEXT) TO service_role;
