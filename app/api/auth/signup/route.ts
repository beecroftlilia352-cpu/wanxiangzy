import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  isExistingSignupIdentity,
  mapInviteCodeError,
  normalizeInviteCode,
} from "@/lib/invite-codes";
import {
  getInviteRewardConfig,
  grantInviteRewards,
  isInviteRewardEnabled,
} from "@/lib/invite-rewards";
import { checkRateLimit, API_RATE_LIMITS } from "@/lib/api/rate-limit";

const SIGNUP_TIMEOUT_MS = 12_000;

export async function POST(request: Request) {
  let usageId = "";

  try {
    const body = await request.json().catch(() => ({})) as {
      email?: unknown;
      password?: unknown;
      inviteCode?: unknown;
      next?: unknown;
    };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const inviteCode = normalizeInviteCode(body.inviteCode);
    const nextPath = getSafeAuthRedirectTarget(body.next);

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "请输入有效邮箱" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "密码至少需要 6 位" }, { status: 400 });
    }
    if (!inviteCode) {
      return NextResponse.json({ error: "请输入邀请码" }, { status: 400 });
    }

    const rateLimitKey = `auth-signup:${email}`;
    const rateLimit = await checkRateLimit(
      rateLimitKey,
      API_RATE_LIMITS.authSignup.limit,
      API_RATE_LIMITS.authSignup.windowMs
    );
    if (!rateLimit.ok) {
      return NextResponse.json(
        { error: `注册请求过于频繁，请 ${rateLimit.retryAfterSeconds} 秒后再试。` },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
      );
    }

    const admin = getAdminClient();
    const consumed = await admin.rpc("consume_invite_code", {
      p_code: inviteCode,
      p_email: email,
      p_metadata: {
        source: "signup",
        userAgent: request.headers.get("user-agent")?.slice(0, 200) || null,
      },
    });

    if (consumed.error) {
      return NextResponse.json({ error: mapInviteCodeError(consumed.error.message) }, { status: 400 });
    }

    const consumedRow = Array.isArray(consumed.data) ? consumed.data[0] : consumed.data;
    usageId = typeof consumedRow?.usage_id === "string" ? consumedRow.usage_id : "";
    if (!usageId) {
      return NextResponse.json({ error: "邀请码占用失败，请稍后重试" }, { status: 503 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SIGNUP_TIMEOUT_MS);
    const supabase = await createServerSupabase({
      fetch: (input, init) => fetch(input, { ...init, signal: controller.signal }),
    });

    const redirectTo = `${getRequestOrigin(request)}${nextPath}`;
    const { data, error } = await supabase.auth
      .signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectTo,
          data: { invite_code: inviteCode },
        },
      })
      .finally(() => clearTimeout(timeout));

    if (error) {
      await releaseInviteUsage(admin, usageId, "signup_error");
      return NextResponse.json({ error: mapSignupError(error.message) }, { status: 400 });
    }

    if (isExistingSignupIdentity(data)) {
      await releaseInviteUsage(admin, usageId, "existing_email");
      return NextResponse.json({ error: "该邮箱已注册，请直接登录" }, { status: 400 });
    }

    if (!data.user?.id) {
      await releaseInviteUsage(admin, usageId, "missing_auth_user");
      return NextResponse.json({ error: "注册服务暂时不可用，请稍后重试" }, { status: 503 });
    }

    await admin
      .from("invite_code_usages")
      .update({
        user_id: data.user.id,
        metadata: {
          source: "signup",
          confirmedImmediately: Boolean(data.session),
          redirectTo,
        },
      })
      .eq("id", usageId);

    // 邀请奖励：best-effort 发放，绝不阻断注册。
    // RPC 以 usage_id 唯一约束保证幂等，重复调用不会二次发奖。
    // 奖励额度来自管理后台配置（invite.rewards），未配置时用默认值。
    const rewards = await getInviteRewardConfig();
    if (isInviteRewardEnabled(rewards)) {
      const rewardResult = await grantInviteRewards({
        usageId,
        inviteeUserId: data.user.id,
        inviterCredits: rewards.inviterCredits,
        inviteeCredits: rewards.inviteeCredits,
      });
      if (!rewardResult.granted && process.env.NODE_ENV === "development") {
        console.warn(`[auth/signup] invite rewards not granted (${rewardResult.reason})`);
      }
    }

    return NextResponse.json({
      user: {
        id: data.user.id,
        email: data.user.email || email,
      },
      session: Boolean(data.session),
    });
  } catch (err: unknown) {
    if (usageId) {
      await releaseInviteUsage(getAdminClient(), usageId, "signup_exception");
    }
    const message =
      err instanceof Error && err.name !== "AbortError" && !isAbortError(err.message)
        ? err.message
        : "注册服务暂时不可用，请稍后重试";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

async function releaseInviteUsage(admin: ReturnType<typeof getAdminClient>, usageId: string, reason: string) {
  try {
    await admin.rpc("release_invite_code_usage", {
      p_usage_id: usageId,
      p_reason: reason,
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[auth/signup] invite release failed:", error);
    }
  }
}

function mapSignupError(message: string) {
  if (message.includes("already registered")) return "该邮箱已注册，请直接登录";
  if (isAbortError(message)) return "注册服务暂时不可用，请稍后重试";
  return message || "注册失败，请稍后重试";
}

function isAbortError(message: string) {
  return /aborted|aborterror/i.test(message);
}

function getSafeAuthRedirectTarget(value: unknown) {
  const next = typeof value === "string" ? value.trim() : "";
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/api/")) return "/create";
  return next;
}

function getRequestOrigin(request: Request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured?.startsWith("http://") || configured?.startsWith("https://")) {
    return configured.replace(/\/+$/, "");
  }
  return new URL(request.url).origin;
}
