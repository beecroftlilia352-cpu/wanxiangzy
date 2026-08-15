-- ============================================================
-- Invite referral rewards (邀请裂变奖励)
-- Run this in Supabase SQL editor after invite-codes.sql.
-- Idempotent: usage_id is UNIQUE, so double-granting is impossible.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.invite_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usage_id UUID NOT NULL UNIQUE
    REFERENCES public.invite_code_usages(id) ON DELETE CASCADE,
  inviter_user_id UUID
    REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_user_id UUID NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  inviter_credits INTEGER NOT NULL DEFAULT 0
    CHECK (inviter_credits BETWEEN 0 AND 10000),
  invitee_credits INTEGER NOT NULL DEFAULT 0
    CHECK (invitee_credits BETWEEN 0 AND 10000),
  status TEXT NOT NULL DEFAULT 'granted'
    CHECK (status IN ('granted', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  revoke_reason TEXT
);

ALTER TABLE public.invite_rewards
  ADD COLUMN IF NOT EXISTS revoke_reason TEXT;

CREATE INDEX IF NOT EXISTS invite_rewards_inviter_created_idx
  ON public.invite_rewards (inviter_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS invite_rewards_invitee_created_idx
  ON public.invite_rewards (invitee_user_id, created_at DESC);

ALTER TABLE public.invite_rewards ENABLE ROW LEVEL SECURITY;

-- 每个用户只允许一个专属邀请码（admin 手工码 campaign 不是 user- 前缀，不受影响）。
-- 若生产库已存在重复的用户码，此索引会创建失败，需要先人工去重。
CREATE UNIQUE INDEX IF NOT EXISTS invite_codes_user_code_uidx
  ON public.invite_codes (created_by)
  WHERE created_by IS NOT NULL AND campaign LIKE 'user-%';

-- ============================================================
-- 原子、幂等地发放邀请奖励：
--   - 同一 usage 只会发放一次（usage_id 唯一约束兜底）
--   - 自邀（inviter = invitee）直接拒绝
--   - admin 手工码（created_by 为空）只发被邀人奖励
--   - 灵点变更与 credit_logs 在同一事务内完成
-- ============================================================
CREATE OR REPLACE FUNCTION public.grant_invite_rewards(
  p_usage_id UUID,
  p_invitee_user_id UUID,
  p_inviter_credits INTEGER DEFAULT 0,
  p_invitee_credits INTEGER DEFAULT 0
)
RETURNS TABLE(
  reward_id UUID,
  inviter_user_id UUID,
  inviter_credits INTEGER,
  invitee_credits INTEGER,
  already_granted BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usage public.invite_code_usages%ROWTYPE;
  v_inviter UUID;
  v_inviter_credits INTEGER;
  v_invitee_credits INTEGER;
  v_reward public.invite_rewards%ROWTYPE;
  v_balance INTEGER;
BEGIN
  IF p_usage_id IS NULL OR p_invitee_user_id IS NULL THEN
    RAISE EXCEPTION 'invalid_invite_reward_args';
  END IF;

  v_inviter_credits := GREATEST(0, LEAST(COALESCE(p_inviter_credits, 0), 10000));
  v_invitee_credits := GREATEST(0, LEAST(COALESCE(p_invitee_credits, 0), 10000));

  SELECT *
  INTO v_usage
  FROM public.invite_code_usages
  WHERE id = p_usage_id
  FOR UPDATE;

  IF NOT FOUND OR v_usage.status <> 'used' THEN
    RAISE EXCEPTION 'invalid_invite_reward_usage';
  END IF;

  IF v_usage.user_id IS DISTINCT FROM p_invitee_user_id THEN
    RAISE EXCEPTION 'invalid_invite_reward_usage';
  END IF;

  SELECT created_by
  INTO v_inviter
  FROM public.invite_codes
  WHERE id = v_usage.invite_code_id;

  IF v_inviter IS NOT DISTINCT FROM p_invitee_user_id THEN
    RAISE EXCEPTION 'self_invite_not_allowed';
  END IF;

  INSERT INTO public.invite_rewards(
    usage_id,
    inviter_user_id,
    invitee_user_id,
    inviter_credits,
    invitee_credits
  )
  VALUES (
    p_usage_id,
    v_inviter,
    p_invitee_user_id,
    v_inviter_credits,
    v_invitee_credits
  )
  ON CONFLICT (usage_id) DO NOTHING
  RETURNING * INTO v_reward;

  IF NOT FOUND THEN
    -- 已发放过：直接返回既有记录，不再改动灵点
    SELECT *
    INTO v_reward
    FROM public.invite_rewards
    WHERE usage_id = p_usage_id;

    RETURN QUERY
      SELECT v_reward.id, v_reward.inviter_user_id, v_reward.inviter_credits, v_reward.invitee_credits, TRUE;
    RETURN;
  END IF;

  -- 邀请人奖励（用户专属码才有邀请人）
  IF v_reward.inviter_user_id IS NOT NULL AND v_reward.inviter_credits > 0 THEN
    UPDATE public.profiles
    SET
      credits = COALESCE(credits, 0) + v_reward.inviter_credits,
      updated_at = NOW()
    WHERE id = v_reward.inviter_user_id
    RETURNING credits INTO v_balance;

    IF FOUND THEN
      INSERT INTO public.credit_logs(user_id, amount, balance, reason)
      VALUES (v_reward.inviter_user_id, v_reward.inviter_credits, v_balance, '邀请奖励：好友注册');
    END IF;
  END IF;

  -- 被邀人奖励
  IF v_reward.invitee_credits > 0 THEN
    UPDATE public.profiles
    SET
      credits = COALESCE(credits, 0) + v_reward.invitee_credits,
      updated_at = NOW()
    WHERE id = v_reward.invitee_user_id
    RETURNING credits INTO v_balance;

    IF FOUND THEN
      INSERT INTO public.credit_logs(user_id, amount, balance, reason)
      VALUES (v_reward.invitee_user_id, v_reward.invitee_credits, v_balance, '邀请奖励：受邀注册');
    END IF;
  END IF;

  RETURN QUERY
    SELECT v_reward.id, v_reward.inviter_user_id, v_reward.inviter_credits, v_reward.invitee_credits, FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_invite_rewards(UUID, UUID, INTEGER, INTEGER) FROM PUBLIC;
-- Supabase 默认权限会给新函数授予 anon/authenticated，必须显式收回，
-- 否则用户可直接调用该 RPC 给自己刷灵点。
REVOKE EXECUTE ON FUNCTION public.grant_invite_rewards(UUID, UUID, INTEGER, INTEGER) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_invite_rewards(UUID, UUID, INTEGER, INTEGER) TO service_role;

-- ============================================================
-- 撤销邀请奖励（后台管理）：
--   - 回收双方已发放的灵点（余额不扣为负），写入负向 credit_logs
--   - 幂等：已撤销的记录直接返回现状，不会重复扣减
-- ============================================================
CREATE OR REPLACE FUNCTION public.revoke_invite_rewards(
  p_reward_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE(reward_id UUID, status TEXT, revoked_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reward public.invite_rewards%ROWTYPE;
  v_balance INTEGER;
BEGIN
  IF p_reward_id IS NULL THEN
    RAISE EXCEPTION 'invite_reward_not_found';
  END IF;

  SELECT *
  INTO v_reward
  FROM public.invite_rewards
  WHERE id = p_reward_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_reward_not_found';
  END IF;

  IF v_reward.status <> 'granted' THEN
    RETURN QUERY SELECT v_reward.id, v_reward.status, v_reward.revoked_at;
    RETURN;
  END IF;

  -- 回收邀请人奖励
  IF v_reward.inviter_user_id IS NOT NULL AND v_reward.inviter_credits > 0 THEN
    UPDATE public.profiles
    SET
      credits = GREATEST(COALESCE(credits, 0) - v_reward.inviter_credits, 0),
      updated_at = NOW()
    WHERE id = v_reward.inviter_user_id
    RETURNING credits INTO v_balance;

    IF FOUND THEN
      INSERT INTO public.credit_logs(user_id, amount, balance, reason)
      VALUES (v_reward.inviter_user_id, -v_reward.inviter_credits, v_balance, '撤销邀请奖励');
    END IF;
  END IF;

  -- 回收被邀人奖励
  IF v_reward.invitee_credits > 0 THEN
    UPDATE public.profiles
    SET
      credits = GREATEST(COALESCE(credits, 0) - v_reward.invitee_credits, 0),
      updated_at = NOW()
    WHERE id = v_reward.invitee_user_id
    RETURNING credits INTO v_balance;

    IF FOUND THEN
      INSERT INTO public.credit_logs(user_id, amount, balance, reason)
      VALUES (v_reward.invitee_user_id, -v_reward.invitee_credits, v_balance, '撤销邀请奖励');
    END IF;
  END IF;

  UPDATE public.invite_rewards
  SET
    status = 'revoked',
    revoked_at = NOW(),
    revoke_reason = LEFT(COALESCE(NULLIF(TRIM(p_reason), ''), 'admin revoked'), 120)
  WHERE id = v_reward.id
  RETURNING revoked_at INTO v_reward.revoked_at;

  RETURN QUERY SELECT v_reward.id, 'revoked'::TEXT, v_reward.revoked_at;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_invite_rewards(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.revoke_invite_rewards(UUID, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_invite_rewards(UUID, TEXT) TO service_role;
