import { getAdminClient } from "@/lib/supabase/admin";
import { withTimeout, isRecord } from "@/lib/utils";

const QUERY_TIMEOUT_MS = 10_000;
const INVITE_CODE_COLUMNS = "id,code,campaign,note,status,max_uses,used_count,starts_at,expires_at,created_by,created_by_email,created_at,updated_at";
const INVITE_USAGE_COLUMNS = "id,invite_code_id,code,email,user_id,status,reason,metadata,created_at,released_at";
const INVITE_REWARD_COLUMNS = "id,inviter_user_id,invitee_user_id,inviter_credits,invitee_credits,status,created_at,revoked_at,revoke_reason";

export type AdminInviteCode = {
  id: string;
  code: string;
  campaign: string | null;
  note: string | null;
  status: "active" | "disabled";
  maxUses: number;
  usedCount: number;
  remaining: number;
  startsAt: string | null;
  expiresAt: string | null;
  createdBy: string | null;
  createdByEmail: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type AdminInviteCodeUsage = {
  id: string;
  inviteCodeId: string;
  code: string;
  email: string;
  userId: string | null;
  status: "used" | "released";
  reason: string | null;
  metadata: Record<string, unknown>;
  createdAt: string | null;
  releasedAt: string | null;
};

export type AdminInviteReward = {
  id: string;
  code: string;
  inviteeEmail: string;
  inviterUserId: string | null;
  inviterEmail: string | null;
  inviteeUserId: string | null;
  inviterCredits: number;
  inviteeCredits: number;
  status: "granted" | "revoked";
  createdAt: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
};

export type AdminInviteRewardMetrics = {
  grantedRewards: number;
  revokedRewards: number;
  totalGrantedCredits: number;
};

export type AdminInviteCodeOverview = {
  codes: AdminInviteCode[];
  usages: AdminInviteCodeUsage[];
  rewards: AdminInviteReward[];
  rewardMetrics: AdminInviteRewardMetrics;
  rewardsAvailable: boolean;
  metrics: {
    totalCodes: number;
    activeCodes: number;
    usedSlots: number;
    remainingSlots: number;
    usageRecords: number;
  };
  available: boolean;
  warnings: string[];
};

export async function getAdminInviteCodeOverview(args: {
  q?: string;
  status?: string;
  codeLimit?: number;
  usageLimit?: number;
  rewardLimit?: number;
} = {}): Promise<AdminInviteCodeOverview> {
  const warnings: string[] = [];
  const q = (args.q || "").trim().toLowerCase();
  const status = args.status === "active" || args.status === "disabled" ? args.status : "";
  const codeLimit = clampInteger(args.codeLimit, 20, 200, 100);
  const usageLimit = clampInteger(args.usageLimit, 20, 300, 120);
  const rewardLimit = clampInteger(args.rewardLimit, 20, 300, 120);
  const admin = getAdminClient();

  let codeQuery = admin
    .from("invite_codes")
    .select(INVITE_CODE_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(codeLimit);
  if (status) codeQuery = codeQuery.eq("status", status);

  const codesResult = await runOptionalQuery<Record<string, unknown>[]>(
    codeQuery,
    "invite codes",
    warnings,
  );
  const usagesResult = await runOptionalQuery<Record<string, unknown>[]>(
    admin
      .from("invite_code_usages")
      .select(INVITE_USAGE_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(usageLimit),
    "invite code usages",
    warnings,
  );
  const rewardsResult = await runOptionalQuery<Record<string, unknown>[]>(
    admin
      .from("invite_rewards")
      .select(`${INVITE_REWARD_COLUMNS},invite_code_usages(code,email)`)
      .order("created_at", { ascending: false })
      .limit(rewardLimit),
    "invite rewards",
    warnings,
  );

  if (!codesResult.ok || !usagesResult.ok) {
    return {
      codes: [],
      usages: [],
      rewards: [],
      rewardMetrics: { grantedRewards: 0, revokedRewards: 0, totalGrantedCredits: 0 },
      rewardsAvailable: false,
      metrics: {
        totalCodes: 0,
        activeCodes: 0,
        usedSlots: 0,
        remainingSlots: 0,
        usageRecords: 0,
      },
      available: false,
      warnings: uniqueStrings(warnings),
    };
  }

  const codes = (codesResult.data || []).map(mapInviteCode).filter((row) => matchesSearch(row, q));
  const usages = (usagesResult.data || []).map(mapInviteUsage).filter((row) => matchesUsageSearch(row, q));
  const rewards = rewardsResult.ok
    ? await enrichInviterEmails(
        (rewardsResult.data || []).map(mapInviteReward).filter((row) => matchesRewardSearch(row, q)),
        admin,
      )
    : [];
  const rewardMetrics = rewards.reduce<AdminInviteRewardMetrics>(
    (acc, reward) => {
      if (reward.status === "granted") {
        acc.grantedRewards += 1;
        acc.totalGrantedCredits += reward.inviterCredits + reward.inviteeCredits;
      } else {
        acc.revokedRewards += 1;
      }
      return acc;
    },
    { grantedRewards: 0, revokedRewards: 0, totalGrantedCredits: 0 },
  );
  const metrics = codes.reduce(
    (acc, code) => {
      acc.totalCodes += 1;
      if (code.status === "active") acc.activeCodes += 1;
      acc.usedSlots += code.usedCount;
      acc.remainingSlots += code.remaining;
      return acc;
    },
    {
      totalCodes: 0,
      activeCodes: 0,
      usedSlots: 0,
      remainingSlots: 0,
      usageRecords: usages.filter((usage) => usage.status === "used").length,
    },
  );

  return {
    codes,
    usages,
    rewards,
    rewardMetrics,
    rewardsAvailable: rewardsResult.ok,
    metrics,
    available: true,
    warnings: uniqueStrings(warnings),
  };
}

/** 撤销邀请奖励（回收双方灵点，幂等） */
export async function revokeInviteReward(rewardId: string, reason: string) {
  const { error } = await getAdminClient().rpc("revoke_invite_rewards", {
    p_reward_id: rewardId,
    p_reason: reason,
  });
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

function mapInviteReward(row: Record<string, unknown>): AdminInviteReward {
  const usage = isRecord(row.invite_code_usages) ? row.invite_code_usages : null;
  return {
    id: stringValue(row.id),
    code: usage ? stringValue(usage.code) : "",
    inviteeEmail: usage ? stringValue(usage.email) : "",
    inviterUserId: nullableString(row.inviter_user_id),
    inviterEmail: null,
    inviteeUserId: nullableString(row.invitee_user_id),
    inviterCredits: Math.max(0, numberValue(row.inviter_credits)),
    inviteeCredits: Math.max(0, numberValue(row.invitee_credits)),
    status: stringValue(row.status) === "revoked" ? "revoked" : "granted",
    createdAt: nullableString(row.created_at),
    revokedAt: nullableString(row.revoked_at),
    revokeReason: nullableString(row.revoke_reason),
  };
}

async function enrichInviterEmails(
  rewards: AdminInviteReward[],
  admin: ReturnType<typeof getAdminClient>,
): Promise<AdminInviteReward[]> {
  const inviterIds = [...new Set(rewards.map((reward) => reward.inviterUserId).filter((id): id is string => Boolean(id)))];
  if (inviterIds.length === 0) return rewards;

  const { data, error } = await admin
    .from("profiles")
    .select("id,email")
    .in("id", inviterIds);

  if (error) {
    console.warn("[admin/invite-codes] inviter profiles query failed:", error.message);
    return rewards;
  }

  const emailById = new Map<string, string>();
  for (const profile of data || []) {
    if (isRecord(profile) && typeof profile.id === "string") {
      emailById.set(profile.id, stringValue(profile.email));
    }
  }

  return rewards.map((reward) => ({
    ...reward,
    inviterEmail: (reward.inviterUserId && emailById.get(reward.inviterUserId)) || null,
  }));
}

function matchesRewardSearch(row: AdminInviteReward, q: string) {
  if (!q) return true;
  return [row.code, row.inviteeEmail, row.inviterEmail || "", row.inviterUserId || "", row.inviteeUserId || ""].some((value) =>
    value.toLowerCase().includes(q),
  );
}

function mapInviteCode(row: Record<string, unknown>): AdminInviteCode {
  const maxUses = Math.max(1, numberValue(row.max_uses));
  const usedCount = Math.max(0, numberValue(row.used_count));

  return {
    id: stringValue(row.id),
    code: stringValue(row.code),
    campaign: nullableString(row.campaign),
    note: nullableString(row.note),
    status: stringValue(row.status) === "disabled" ? "disabled" : "active",
    maxUses,
    usedCount,
    remaining: Math.max(0, maxUses - usedCount),
    startsAt: nullableString(row.starts_at),
    expiresAt: nullableString(row.expires_at),
    createdBy: nullableString(row.created_by),
    createdByEmail: nullableString(row.created_by_email),
    createdAt: nullableString(row.created_at),
    updatedAt: nullableString(row.updated_at),
  };
}

function mapInviteUsage(row: Record<string, unknown>): AdminInviteCodeUsage {
  return {
    id: stringValue(row.id),
    inviteCodeId: stringValue(row.invite_code_id),
    code: stringValue(row.code),
    email: stringValue(row.email),
    userId: nullableString(row.user_id),
    status: stringValue(row.status) === "released" ? "released" : "used",
    reason: nullableString(row.reason),
    metadata: isRecord(row.metadata) ? row.metadata : {},
    createdAt: nullableString(row.created_at),
    releasedAt: nullableString(row.released_at),
  };
}

async function runOptionalQuery<T>(
  query: PromiseLike<{ data?: T | null; error?: { code?: string; message?: string } | null }>,
  label: string,
  warnings: string[],
): Promise<{ ok: true; data: T | null } | { ok: false; data: null }> {
  try {
    const response = await withTimeout(query, QUERY_TIMEOUT_MS, `${label} timeout`);
    if (response.error) {
      if (!isMissingTableError(response.error)) warnings.push(`${label}: ${response.error.message || "query failed"}`);
      return { ok: false, data: null };
    }
    return { ok: true, data: response.data ?? null };
  } catch (error) {
    warnings.push(`${label}: ${toMessage(error)}`);
    return { ok: false, data: null };
  }
}

function matchesSearch(row: AdminInviteCode, q: string) {
  if (!q) return true;
  return [row.code, row.campaign || "", row.note || "", row.createdByEmail || ""].some((value) => value.toLowerCase().includes(q));
}

function matchesUsageSearch(row: AdminInviteCodeUsage, q: string) {
  if (!q) return true;
  return [row.code, row.email, row.userId || "", row.reason || ""].some((value) => value.toLowerCase().includes(q));
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableString(value: unknown) {
  const str = stringValue(value);
  return str || null;
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const clean = value.trim();
    if (!clean || seen.has(clean)) return false;
    seen.add(clean);
    return true;
  });
}

function isMissingTableError(error: { code?: string; message?: string }) {
  const message = `${error.code || ""} ${error.message || ""}`.toLowerCase();
  return message.includes("42p01") || message.includes("does not exist");
}

function toMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
