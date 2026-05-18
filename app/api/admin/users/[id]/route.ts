import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { getAdminUserDetail } from "@/lib/admin/data";
import { getAdminClient } from "@/lib/supabase/admin";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireAdminApi("users:read");
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "无效用户 ID" }, { status: 400 });
  }

  const detail = await getAdminUserDetail(id);
  if (!detail.profile) {
    return NextResponse.json({ error: "用户不存在", detail }, { status: 404 });
  }

  return NextResponse.json(detail, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireAdminApi("users:write");
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "无效用户 ID" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({})) as {
    action?: unknown;
    displayName?: unknown;
    status?: unknown;
    generateEnabled?: unknown;
    supportLevel?: unknown;
    reason?: unknown;
    note?: unknown;
    expiresAt?: unknown;
  };
  const action = typeof body.action === "string" ? body.action : "";

  if (action === "update_profile") {
    const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";
    if (displayName.length > 80) {
      return NextResponse.json({ error: "显示名不能超过 80 个字符" }, { status: 400 });
    }

    const { data, error } = await getAdminClient()
      .from("profiles")
      .update({ display_name: displayName || null, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id,email,display_name,updated_at")
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ error: "用户不存在" }, { status: 404 });

    await writeAdminAuditLog(auth.context, {
      action: "user.profile.update",
      resourceType: "profile",
      resourceId: id,
      reason: "Admin updated user profile",
      metadata: { displayName },
    });

    return NextResponse.json({ ok: true, profile: data }, { headers: { "Cache-Control": "no-store" } });
  }

  if (action === "update_control") {
    const status = normalizeAccountStatus(body.status);
    const generateEnabled = body.generateEnabled !== false;
    const supportLevel = normalizeSupportLevel(body.supportLevel);
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const note = typeof body.note === "string" ? body.note.trim() : "";
    const expiresAt = parseNullableIsoDate(body.expiresAt);

    if ((status !== "active" || !generateEnabled) && reason.length < 4) {
      return NextResponse.json({ error: "限制用户或暂停生成时必须填写至少 4 个字符的原因" }, { status: 400 });
    }
    if (reason.length > 240 || note.length > 1000) {
      return NextResponse.json({ error: "原因或备注过长" }, { status: 400 });
    }
    if (expiresAt === false) {
      return NextResponse.json({ error: "expiresAt 必须是有效日期" }, { status: 400 });
    }

    const { data, error } = await getAdminClient()
      .from("admin_user_controls")
      .upsert({
        user_id: id,
        status,
        generate_enabled: generateEnabled,
        support_level: supportLevel,
        reason: reason || null,
        note: note || null,
        expires_at: expiresAt,
        updated_by: auth.context.userId,
        updated_by_email: auth.context.email,
        updated_by_role: auth.context.role,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" })
      .select("user_id,status,generate_enabled,support_level,reason,note,expires_at,updated_by_email,updated_at")
      .single();

    if (error) {
      const message = `${error.code || ""} ${error.message || ""}`.toLowerCase();
      const statusCode = message.includes("admin_user_controls") || message.includes("could not find") ? 501 : 400;
      return NextResponse.json({ error: error.message }, { status: statusCode });
    }

    await writeAdminAuditLog(auth.context, {
      action: "user.control.update",
      resourceType: "profile",
      resourceId: id,
      reason: reason || "Admin updated user controls",
      metadata: { status, generateEnabled, supportLevel, expiresAt, note },
    });

    return NextResponse.json({ ok: true, control: data }, { headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json({ error: "不支持的用户操作" }, { status: 400 });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeAccountStatus(value: unknown) {
  return value === "restricted" || value === "suspended" ? value : "active";
}

function normalizeSupportLevel(value: unknown) {
  return value === "priority" || value === "watch" ? value : "standard";
}

function parseNullableIsoDate(value: unknown): string | null | false {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : false;
}
