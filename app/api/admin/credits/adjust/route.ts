import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { getAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const auth = await requireAdminApi("credits:write");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({})) as {
    userId?: unknown;
    amount?: unknown;
    reason?: unknown;
  };
  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const amount = Number(body.amount);
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (!isUuid(userId)) {
    return NextResponse.json({ error: "userId 必须是有效 UUID" }, { status: 400 });
  }
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 10000) {
    return NextResponse.json({ error: "amount 必须是 -10000 到 10000 之间的非零整数" }, { status: 400 });
  }
  if (reason.length < 4 || reason.length > 240) {
    return NextResponse.json({ error: "reason 需要 4-240 个字符" }, { status: 400 });
  }

  const { data, error } = await getAdminClient().rpc("admin_adjust_user_credits", {
    p_user_id: userId,
    p_amount: amount,
    p_reason: reason,
    p_actor_user_id: auth.context.userId,
    p_actor_email: auth.context.email,
    p_actor_role: auth.context.role,
  });

  if (error) {
    const message = `${error.code || ""} ${error.message || ""}`.toLowerCase();
    const status = message.includes("admin_adjust_user_credits") || message.includes("could not find") ? 501 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "no-store" } });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
