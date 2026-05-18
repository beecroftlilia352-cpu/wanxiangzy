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
