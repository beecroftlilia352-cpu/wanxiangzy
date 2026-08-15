import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { revokeInviteReward } from "@/lib/admin/invite-codes";
import {
  INVITE_REWARD_DEFAULTS,
  INVITE_REWARD_MAX,
  clearInviteRewardConfigCache,
  getInviteRewardConfig,
} from "@/lib/invite-rewards";
import { getAdminClient } from "@/lib/supabase/admin";
import { isRecord } from "@/lib/utils";

const CONFIG_KEY = "invite.rewards";

/** 读取邀请奖励配置（后台用）：已发布配置 + 当前生效值 */
export async function GET() {
  const auth = await requireAdminApi("settings:read");
  if (!auth.ok) return auth.response;

  const { data } = await getAdminClient()
    .from("admin_config_versions")
    .select("value,published_at,created_by")
    .eq("config_key", CONFIG_KEY)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const effective = await getInviteRewardConfig();

  return NextResponse.json({
    config: isRecord(data?.value) ? data.value : null,
    publishedAt: data?.published_at ?? null,
    createdBy: data?.created_by ?? null,
    effective,
    defaults: INVITE_REWARD_DEFAULTS,
  });
}

/** 保存并发布邀请奖励配置（无需环境变量，后台即时生效） */
export async function POST(request: Request) {
  const auth = await requireAdminApi("settings:write");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const inviterCredits = Number(body.inviterCredits);
  const inviteeCredits = Number(body.inviteeCredits);
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (!isValidRewardAmount(inviterCredits) || !isValidRewardAmount(inviteeCredits)) {
    return NextResponse.json(
      { error: `奖励额度必须是 0-${INVITE_REWARD_MAX} 之间的整数（0 表示不发放）` },
      { status: 400 },
    );
  }

  const value = {
    inviterCredits,
    inviteeCredits,
    updatedAt: new Date().toISOString(),
  };

  const { error } = await getAdminClient()
    .from("admin_config_versions")
    .insert({
      config_key: CONFIG_KEY,
      status: "published",
      value,
      created_by: auth.context.email || auth.context.userId,
      published_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });

  if (error) {
    return NextResponse.json({ error: `保存失败：${error.message}` }, { status: 500 });
  }

  clearInviteRewardConfigCache();
  await writeAdminAuditLog(auth.context, {
    action: "invite_reward_config.update",
    resourceType: "config",
    resourceId: CONFIG_KEY,
    reason: reason || "更新邀请奖励配置",
    metadata: value,
  });

  return NextResponse.json({ ok: true, effective: value });
}

/** 撤销邀请奖励：回收双方已发放的灵点（幂等，重复撤销不会重复扣减） */
export async function PATCH(request: Request) {
  const auth = await requireAdminApi("settings:write");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({})) as {
    id?: unknown;
    reason?: unknown;
  };
  const id = typeof body.id === "string" ? body.id.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 120) : "管理员撤销";

  if (!isUuid(id)) {
    return NextResponse.json({ error: "id 必须是有效 UUID" }, { status: 400 });
  }

  const result = await revokeInviteReward(id, reason);
  if (!result.ok) {
    return NextResponse.json({ error: mapRevokeError(result.error) }, { status: 400 });
  }

  await writeAdminAuditLog(auth.context, {
    action: "invite_reward.revoke",
    resourceType: "invite_reward",
    resourceId: id,
    reason: `Revoke invite reward ${id}`,
    metadata: { reason },
  });

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

function isValidRewardAmount(value: unknown) {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= INVITE_REWARD_MAX;
}

function mapRevokeError(message: string) {
  if (message.includes("invite_reward_not_found")) return "奖励记录不存在";
  return message || "撤销失败，请稍后重试";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
