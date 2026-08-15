import { getAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { isRecord } from "@/lib/utils";

export const INVITE_REWARD_DEFAULTS = {
  inviterCredits: 100,
  inviteeCredits: 50,
} as const;

export const INVITE_REWARD_MAX = 10_000;

export type InviteRewardConfig = {
  inviterCredits: number;
  inviteeCredits: number;
};

const CONFIG_KEY = "invite.rewards";
const CACHE_TTL_MS = 5 * 60 * 1000;

let cache: { expiresAt: number; value: InviteRewardConfig } | null = null;
let inFlight: Promise<InviteRewardConfig> | null = null;

/**
 * 读取邀请奖励配置（后台发布，5 分钟内存缓存）。
 * 未配置时回退默认值；读取失败**不缓存**（下次请求重试），并发首次读取共享同一 Promise。
 */
export async function getInviteRewardConfig(): Promise<InviteRewardConfig> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;

  if (!inFlight) {
    inFlight = (async () => {
      let value: InviteRewardConfig = { ...INVITE_REWARD_DEFAULTS };
      try {
        const { data } = await getAdminClient()
          .from("admin_config_versions")
          .select("value")
          .eq("config_key", CONFIG_KEY)
          .eq("status", "published")
          .order("published_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (isRecord(data?.value)) {
          value = normalizeInviteRewardConfig(data.value);
        }
        cache = { expiresAt: Date.now() + CACHE_TTL_MS, value };
      } catch (error) {
        // 读取失败不缓存默认值：下一次请求重试，避免瞬时故障把错误额度锁定 5 分钟
        logger.error("[invite-rewards] config read failed, using defaults for this call only:", error);
      }
      return value;
    })().finally(() => {
      inFlight = null;
    });
  }

  return inFlight;
}

/** 清除配置缓存（后台发布后由 API 调用） */
export function clearInviteRewardConfigCache() {
  cache = null;
}

/** 校验并夹取配置值（后台读取兜底 + 测试用纯函数） */
export function normalizeInviteRewardConfig(value: unknown): InviteRewardConfig {
  const record = isRecord(value) ? value : {};
  return {
    inviterCredits: clampToRewardRange(record.inviterCredits, INVITE_REWARD_DEFAULTS.inviterCredits),
    inviteeCredits: clampToRewardRange(record.inviteeCredits, INVITE_REWARD_DEFAULTS.inviteeCredits),
  };
}

export function isInviteRewardEnabled(config: InviteRewardConfig) {
  return config.inviterCredits > 0 || config.inviteeCredits > 0;
}

export type InviteRewardGrantResult =
  | { granted: true; alreadyGranted: boolean }
  | { granted: false; reason: "no-reward-configured" | "rpc-failed" | "invalid-args" };

/**
 * 邀请奖励发放（幂等）：RPC 内部以 usage_id 唯一约束兜底，
 * 重复调用只会返回已有记录，不会重复发放灵点。
 * 失败不抛异常，调用方（注册流程）不能因此阻断注册。
 */
export async function grantInviteRewards(params: {
  usageId: string;
  inviteeUserId: string;
  inviterCredits: number;
  inviteeCredits: number;
}): Promise<InviteRewardGrantResult> {
  const { usageId, inviteeUserId, inviterCredits, inviteeCredits } = params;

  if (!usageId || !inviteeUserId) {
    return { granted: false, reason: "invalid-args" };
  }

  if (inviterCredits <= 0 && inviteeCredits <= 0) {
    return { granted: false, reason: "no-reward-configured" };
  }

  const admin = getAdminClient();
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const { data, error } = await admin.rpc("grant_invite_rewards", {
      p_usage_id: usageId,
      p_invitee_user_id: inviteeUserId,
      p_inviter_credits: inviterCredits,
      p_invitee_credits: inviteeCredits,
    });

    if (!error) {
      const row = Array.isArray(data) ? data[0] : data;
      if (row && typeof row === "object") {
        return {
          granted: true,
          alreadyGranted: Boolean((row as { already_granted?: boolean }).already_granted),
        };
      }
      return { granted: false, reason: "rpc-failed" };
    }

    // 自邀 / usage 不合法属于数据异常，重试无意义；其余错误重试一次
    const isPermanent = /self_invite|invalid_invite_reward/.test(error.message);
    if (isPermanent || attempt === maxAttempts) {
      logger.error(`[invite-rewards] grant failed for usage ${usageId}:`, error.message);
      return { granted: false, reason: "rpc-failed" };
    }

    await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
  }

  return { granted: false, reason: "rpc-failed" };
}

function clampToRewardRange(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(INVITE_REWARD_MAX, Math.max(0, parsed));
}
