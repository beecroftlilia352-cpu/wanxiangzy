import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getReadAuthenticatedUser, type ReadAuthenticatedUser } from "@/lib/api/read-auth";
import { getAdminClient } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  getAdminPermissions,
  hasAdminPermission,
  isBootstrapAdminEmail,
  normalizeAdminRole,
  normalizeEmail,
  type AdminPermission,
  type AdminRole,
} from "@/lib/admin/permissions";

type AdminMemberRow = {
  user_id: string | null;
  email: string | null;
  role: string | null;
  enabled?: boolean | null;
  status?: string | null;
  display_name?: string | null;
};

export type AdminContext = {
  userId: string;
  email: string | null;
  role: AdminRole;
  permissions: AdminPermission[];
  source: "table" | "bootstrap-env";
};

export type AdminAccessResult =
  | { ok: true; context: AdminContext }
  | { ok: false; reason: "unauthenticated" | "forbidden"; user?: ReadAuthenticatedUser };

const AUTH_CLAIMS_TIMEOUT_MS = 1_500;
const AUTH_USER_FALLBACK_TIMEOUT_MS = 3_000;
const ADMIN_MEMBER_SELECT = "user_id,email,role,enabled,status,display_name";

export async function getAdminAccess(): Promise<AdminAccessResult> {
  const supabase = await createServerSupabase({ readonlyCookies: true });
  const user = await getReadAuthenticatedUser(supabase, {
    claimsTimeoutMs: AUTH_CLAIMS_TIMEOUT_MS,
    userFallbackTimeoutMs: AUTH_USER_FALLBACK_TIMEOUT_MS,
    onWarning: logAdminAuthWarning,
  });

  if (!user) {
    return { ok: false, reason: "unauthenticated" };
  }

  const email = normalizeEmail(user.email);
  const member = await loadAdminMember(user.id, email);
  if (member && isActiveAdminMember(member)) {
    const role = normalizeAdminRole(member.role);
    return {
      ok: true,
      context: {
        userId: user.id,
        email: member.email || user.email,
        role,
        permissions: getAdminPermissions(role),
        source: "table",
      },
    };
  }

  if (isBootstrapAdminEmail(email)) {
    return {
      ok: true,
      context: {
        userId: user.id,
        email: user.email,
        role: "owner",
        permissions: getAdminPermissions("owner"),
        source: "bootstrap-env",
      },
    };
  }

  return { ok: false, reason: "forbidden", user };
}

export async function requireAdmin(permission: AdminPermission | AdminPermission[] = "admin:read") {
  const access = await getAdminAccess();
  if (!access.ok) {
    if (access.reason === "unauthenticated") {
      redirect("/login?next=/admin");
    }
    redirect("/admin-forbidden");
  }
  if (!hasAdminPermission(access.context.role, permission)) {
    redirect("/admin-forbidden");
  }
  return access.context;
}

export async function requireAdminApi(permission: AdminPermission | AdminPermission[] = "admin:read") {
  const access = await getAdminAccess();
  if (!access.ok) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          error: access.reason === "unauthenticated" ? "请先登录" : "没有后台访问权限",
        },
        { status: access.reason === "unauthenticated" ? 401 : 403 },
      ),
    };
  }

  if (!hasAdminPermission(access.context.role, permission)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "当前角色无权执行该操作" }, { status: 403 }),
    };
  }

  return { ok: true as const, context: access.context };
}

async function loadAdminMember(userId: string, email: string) {
  const admin = getAdminClient();

  const byId = await admin
    .from("admin_members")
    .select(ADMIN_MEMBER_SELECT)
    .eq("user_id", userId)
    .maybeSingle();

  if (byId.error && !isMissingAdminTableError(byId.error)) {
    logAdminAuthWarning("admin member lookup by user_id failed", byId.error.message);
  }
  if (byId.data) {
    return byId.data as AdminMemberRow;
  }
  if (byId.error && isMissingAdminTableError(byId.error)) {
    return null;
  }

  if (!email) {
    return null;
  }

  const byEmail = await admin
    .from("admin_members")
    .select(ADMIN_MEMBER_SELECT)
    .eq("email", email)
    .maybeSingle();

  if (byEmail.error) {
    if (!isMissingAdminTableError(byEmail.error)) {
      logAdminAuthWarning("admin member lookup by email failed", byEmail.error.message);
    }
    return null;
  }

  return (byEmail.data as AdminMemberRow | null) || null;
}

function isActiveAdminMember(row: AdminMemberRow) {
  if (row.enabled === false) return false;
  const status = typeof row.status === "string" ? row.status.toLowerCase() : "active";
  return status === "active";
}

function isMissingAdminTableError(error: { code?: string; message?: string }) {
  const message = `${error.code || ""} ${error.message || ""}`.toLowerCase();
  return message.includes("admin_members") || message.includes("42p01") || message.includes("does not exist");
}

function logAdminAuthWarning(label: string, detail: unknown) {
  if (process.env.NODE_ENV === "development") {
    console.warn(`[admin/auth] ${label}:`, detail);
  }
}
