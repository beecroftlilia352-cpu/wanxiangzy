-- Invite code gate for temporary registration control.
-- Run this in Supabase SQL editor before enabling invite-only signup.

CREATE TABLE IF NOT EXISTS public.invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE
    CHECK (code = upper(code) AND code ~ '^[A-Z0-9]{4,64}$'),
  campaign TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled')),
  max_uses INTEGER NOT NULL DEFAULT 1
    CHECK (max_uses >= 1 AND max_uses <= 1000),
  used_count INTEGER NOT NULL DEFAULT 0
    CHECK (used_count >= 0),
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  CONSTRAINT invite_codes_validity_window_chk
    CHECK (expires_at IS NULL OR starts_at IS NULL OR expires_at > starts_at),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.invite_codes
  ADD COLUMN IF NOT EXISTS campaign TEXT,
  ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invite_codes_validity_window_chk'
      AND conrelid = 'public.invite_codes'::regclass
  ) THEN
    ALTER TABLE public.invite_codes
      ADD CONSTRAINT invite_codes_validity_window_chk
      CHECK (expires_at IS NULL OR starts_at IS NULL OR expires_at > starts_at) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS invite_codes_status_created_idx
  ON public.invite_codes (status, created_at DESC);

CREATE INDEX IF NOT EXISTS invite_codes_expires_idx
  ON public.invite_codes (expires_at);

CREATE INDEX IF NOT EXISTS invite_codes_starts_idx
  ON public.invite_codes (starts_at);

ALTER TABLE public.invite_codes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.invite_code_usages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code_id UUID NOT NULL REFERENCES public.invite_codes(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  email TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'used'
    CHECK (status IN ('used', 'released')),
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS invite_code_usages_code_created_idx
  ON public.invite_code_usages (code, created_at DESC);

CREATE INDEX IF NOT EXISTS invite_code_usages_email_created_idx
  ON public.invite_code_usages (LOWER(email), created_at DESC);

CREATE INDEX IF NOT EXISTS invite_code_usages_user_created_idx
  ON public.invite_code_usages (user_id, created_at DESC);

ALTER TABLE public.invite_code_usages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.touch_invite_code_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS invite_codes_touch_updated_at ON public.invite_codes;
CREATE TRIGGER invite_codes_touch_updated_at
  BEFORE UPDATE ON public.invite_codes
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_invite_code_updated_at();

CREATE OR REPLACE FUNCTION public.consume_invite_code(
  p_code TEXT,
  p_email TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE(invite_code_id UUID, usage_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT;
  v_email TEXT;
  v_invite public.invite_codes%ROWTYPE;
  v_usage_id UUID;
BEGIN
  v_code := upper(regexp_replace(coalesce(trim(p_code), ''), '[\s-]+', '', 'g'));
  v_email := lower(coalesce(trim(p_email), ''));

  IF v_code = '' OR v_email = '' THEN
    RAISE EXCEPTION 'invalid_invite_code';
  END IF;

  SELECT *
  INTO v_invite
  FROM public.invite_codes
  WHERE code = v_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_invite_code';
  END IF;

  IF v_invite.status <> 'active' THEN
    RAISE EXCEPTION 'disabled_invite_code';
  END IF;

  IF v_invite.starts_at IS NOT NULL AND v_invite.starts_at > NOW() THEN
    RAISE EXCEPTION 'not_started_invite_code';
  END IF;

  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at <= NOW() THEN
    RAISE EXCEPTION 'expired_invite_code';
  END IF;

  IF v_invite.used_count >= v_invite.max_uses THEN
    RAISE EXCEPTION 'exhausted_invite_code';
  END IF;

  INSERT INTO public.invite_code_usages(invite_code_id, code, email, status, metadata)
  VALUES (v_invite.id, v_invite.code, v_email, 'used', coalesce(p_metadata, '{}'::jsonb))
  RETURNING id INTO v_usage_id;

  UPDATE public.invite_codes
  SET used_count = used_count + 1
  WHERE id = v_invite.id;

  RETURN QUERY SELECT v_invite.id, v_usage_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_invite_code_usage(
  p_usage_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usage public.invite_code_usages%ROWTYPE;
BEGIN
  IF p_usage_id IS NULL THEN
    RETURN;
  END IF;

  SELECT *
  INTO v_usage
  FROM public.invite_code_usages
  WHERE id = p_usage_id
  FOR UPDATE;

  IF NOT FOUND OR v_usage.status <> 'used' THEN
    RETURN;
  END IF;

  UPDATE public.invite_code_usages
  SET
    status = 'released',
    reason = left(coalesce(nullif(trim(p_reason), ''), 'released'), 120),
    released_at = NOW()
  WHERE id = p_usage_id;

  UPDATE public.invite_codes
  SET used_count = greatest(used_count - 1, 0)
  WHERE id = v_usage.invite_code_id;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_invite_code(TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_invite_code_usage(UUID, TEXT) FROM PUBLIC;
-- Supabase 默认权限会给新函数授予 anon/authenticated，必须显式收回，
-- 否则普通用户可绕过注册流程直接占用/释放邀请码。
REVOKE EXECUTE ON FUNCTION public.consume_invite_code(TEXT, TEXT, JSONB) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_invite_code_usage(UUID, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_invite_code(TEXT, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_invite_code_usage(UUID, TEXT) TO service_role;
