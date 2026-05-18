import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { listAdminMembers } from "@/lib/admin/data";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { normalizeAdminRole } from "@/lib/admin/permissions";
import { getAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const auth = await requireAdminApi("settings:read");
  if (!auth.ok) return auth.response;

  const params = new URL(request.url).searchParams;
  const members = await listAdminMembers({ limit: Number(params.get("limit") || 50) });

  return NextResponse.json(members, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi("settings:write");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({})) as {
    userId?: unknown;
    email?: unknown;
    role?: unknown;
    status?: unknown;
  };
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const role = normalizeAdminRole(body.role);
  const status = body.status === "disabled" ? "disabled" : "active";

  if (!isUuid(userId)) {
    return NextResponse.json({ error: "userId 必须是有效 UUID" }, { status: 400 });
  }
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "email 必须有效" }, { status: 400 });
  }

  const { data, error } = await getAdminClient()
    .from("admin_members")
    .upsert({
      user_id: userId,
      email,
      role,
      status,
      enabled: status === "active",
    }, { onConflict: "user_id" })
    .select("user_id,email,role,status,enabled,created_at,updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await writeAdminAuditLog(auth.context, {
    action: "admin_member.upsert",
    resourceType: "admin_member",
    resourceId: userId,
    reason: `Set ${email} as ${role}/${status}`,
    metadata: { email, role, status },
  });

  return NextResponse.json({ ok: true, member: data }, { headers: { "Cache-Control": "no-store" } });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
