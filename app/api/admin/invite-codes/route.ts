import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { getAdminInviteCodeOverview } from "@/lib/admin/invite-codes";
import { generateInviteCode, normalizeInviteCode } from "@/lib/invite-codes";
import { getAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const auth = await requireAdminApi("settings:read");
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  const overview = await getAdminInviteCodeOverview({
    q: params.get("q") || "",
    status: params.get("status") || "",
    codeLimit: Number(params.get("limit") || 100),
    usageLimit: Number(params.get("usageLimit") || 120),
  });

  return NextResponse.json(overview, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi("settings:write");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({})) as {
    count?: unknown;
    prefix?: unknown;
    maxUses?: unknown;
    campaign?: unknown;
    note?: unknown;
    startsAt?: unknown;
    expiresAt?: unknown;
  };
  const count = clampInteger(body.count, 1, 50, 1);
  const maxUses = clampInteger(body.maxUses, 1, 1000, 1);
  const prefix = normalizeInviteCode(body.prefix).replace(/[^A-Z0-9]/g, "").slice(0, 12) || "VW";
  const campaign = typeof body.campaign === "string" ? body.campaign.trim().slice(0, 80) : "";
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 200) : "";
  const startsAt = parseDateTime(body.startsAt);
  const expiresAt = parseExpiresAt(body.expiresAt);

  if (body.startsAt && !startsAt) {
    return NextResponse.json({ error: "生效时间格式无效" }, { status: 400 });
  }
  if (body.expiresAt && !expiresAt) {
    return NextResponse.json({ error: "过期时间格式无效" }, { status: 400 });
  }
  if (startsAt && expiresAt && Date.parse(startsAt) >= Date.parse(expiresAt)) {
    return NextResponse.json({ error: "过期时间必须晚于生效时间" }, { status: 400 });
  }

  const rows = Array.from({ length: count }, () => ({
    code: generateInviteCode({ prefix }),
    campaign: campaign || null,
    note: note || null,
    max_uses: maxUses,
    status: "active",
    starts_at: startsAt,
    expires_at: expiresAt,
    created_by: auth.context.userId,
    created_by_email: auth.context.email,
  }));

  const { data, error } = await getAdminClient()
    .from("invite_codes")
    .insert(rows)
    .select("id,code,campaign,note,status,max_uses,used_count,starts_at,expires_at,created_by_email,created_at");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await writeAdminAuditLog(auth.context, {
    action: "invite_code.create",
    resourceType: "invite_code",
    reason: `Create ${count} invite code(s)`,
    metadata: { count, maxUses, prefix, campaign, startsAt, expiresAt, note },
  });

  return NextResponse.json({ ok: true, codes: data || [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const auth = await requireAdminApi("settings:write");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({})) as {
    id?: unknown;
    status?: unknown;
  };
  const id = typeof body.id === "string" ? body.id.trim() : "";
  const status = body.status === "disabled" ? "disabled" : body.status === "active" ? "active" : "";

  if (!isUuid(id)) {
    return NextResponse.json({ error: "id 必须是有效 UUID" }, { status: 400 });
  }
  if (!status) {
    return NextResponse.json({ error: "status 只能是 active 或 disabled" }, { status: 400 });
  }

  const { data, error } = await getAdminClient()
    .from("invite_codes")
    .update({ status })
    .eq("id", id)
    .select("id,code,status")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await writeAdminAuditLog(auth.context, {
    action: "invite_code.status.update",
    resourceType: "invite_code",
    resourceId: id,
    reason: `Set invite code ${data?.code || id} to ${status}`,
    metadata: { status, code: data?.code || null },
  });

  return NextResponse.json({ ok: true, code: data }, { headers: { "Cache-Control": "no-store" } });
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function parseDateTime(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function parseExpiresAt(value: unknown) {
  return parseDateTime(value);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
