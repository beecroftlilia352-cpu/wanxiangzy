import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";
import { generateInviteCode } from "@/lib/invite-codes";
import { getInviteRewardConfig } from "@/lib/invite-rewards";
import { logger } from "@/lib/logger";
import { getConfiguredPublicBaseUrl } from "@/lib/env";

const USER_CODE_MAX_USES = 200;
const USER_CODE_COLUMNS = "id,code,status,max_uses,used_count,created_at";

type InviteCodeRow = {
  id: string;
  code: string;
  status: string;
  max_uses: number;
  used_count: number;
  created_at: string | null;
};

type UsageRow = {
  id: string;
  email: string;
  status: string;
  created_at: string | null;
  invite_rewards: Array<{ inviter_credits: number }> | null;
};

/** 获取当前用户的专属邀请码、邀请记录与奖励规则 */
export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const limit = await checkRateLimit(`invite-me:${user.id}`, 20, 60_000);
  if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

  const admin = getAdminClient();
  const campaign = `user-${user.id.slice(0, 8)}`;

  // 用户专属邀请码（无则自动创建；唯一部分索引 + 冲突重试兜底并发）
  let inviteCode: InviteCodeRow | null;
  try {
    inviteCode = await findUserInviteCode(admin, user.id, campaign);
    if (!inviteCode) {
      inviteCode = await createUserInviteCode(admin, user, campaign);
    }
  } catch (error) {
    logger.error("[invite/me] invite code get-or-create failed:", error);
    return NextResponse.json({ error: "邀请码服务暂时不可用，请稍后重试" }, { status: 500 });
  }

  const rewards = await getInviteRewardConfig();

  // 邀请记录 + 已发放奖励（invite_rewards 通过 usage_id 外键嵌入）
  const { data: usageRows, error: usagesError } = await admin
    .from("invite_code_usages")
    .select("id,email,status,created_at,invite_rewards(id,inviter_credits)")
    .eq("invite_code_id", inviteCode.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (usagesError) {
    logger.error("[invite/me] usages query failed:", usagesError.message);
  }

  const usages = (usageRows || [])
    .filter((row: UsageRow) => row.status === "used")
    .map((row: UsageRow) => {
      const reward = row.invite_rewards?.[0];
      return {
        id: row.id,
        email: row.email,
        rewarded: Boolean(reward),
        inviterCredits: reward?.inviter_credits ?? 0,
        createdAt: row.created_at,
      };
    });

  const rewardedCount = usages.filter((usage) => usage.rewarded).length;
  const totalRewardCredits = usages.reduce((sum, usage) => sum + usage.inviterCredits, 0);

  const origin =
    getConfiguredPublicBaseUrl({ allowNonProductionFallbacks: true }) ||
    new URL(request.url).origin;
  const inviteUrl = `${origin}/login?invite=${inviteCode.code}`;

  return NextResponse.json({
    code: inviteCode.code,
    maxUses: inviteCode.max_uses,
    usedCount: inviteCode.used_count,
    remaining: Math.max(inviteCode.max_uses - inviteCode.used_count, 0),
    rules: {
      inviterCredits: rewards.inviterCredits,
      inviteeCredits: rewards.inviteeCredits,
    },
    rewardedCount,
    totalRewardCredits,
    inviteUrl,
    shareText: `送你 Pixel Diffusion AI 服装视觉工作台邀请，注册双方各得灵点奖励：${inviteUrl}`,
    usages,
  });
}

async function findUserInviteCode(admin: ReturnType<typeof getAdminClient>, userId: string, campaign: string) {
  const { data } = await admin
    .from("invite_codes")
    .select(USER_CODE_COLUMNS)
    .eq("created_by", userId)
    .eq("campaign", campaign)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as InviteCodeRow | null;
}

async function createUserInviteCode(
  admin: ReturnType<typeof getAdminClient>,
  user: { id: string; email?: string },
  campaign: string,
) {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const code = generateInviteCode(); // 加密随机，避免可预测邀请码
    const { data, error } = await admin
      .from("invite_codes")
      .insert({
        code,
        campaign,
        note: "用户专属邀请码（自动生成）",
        status: "active",
        max_uses: USER_CODE_MAX_USES,
        created_by: user.id,
        created_by_email: user.email,
        starts_at: new Date().toISOString(),
        expires_at: null,
      })
      .select(USER_CODE_COLUMNS)
      .single();

    if (!error) return data as InviteCodeRow;

    // 唯一部分索引冲突：并发下已有邀请码，直接重查
    if (error.code === "23505") {
      const existing = await findUserInviteCode(admin, user.id, campaign);
      if (existing) return existing;
      continue;
    }

    throw new Error(`邀请码生成失败：${error.message}`);
  }
  throw new Error("邀请码生成失败，请稍后重试");
}
