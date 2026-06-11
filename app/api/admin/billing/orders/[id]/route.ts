import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { getAdminClient } from "@/lib/supabase/admin";

type Params = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  const auth = await requireAdminApi("billing:read");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "订单 ID 不能为空" }, { status: 400 });

  const admin = getAdminClient();
  const { data: order, error } = await admin
    .from("payment_orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!order) return NextResponse.json({ error: "订单不存在" }, { status: 404 });

  const { data: creditLogs } = await admin
    .from("credit_logs")
    .select("id,user_id,amount,balance,reason,billing_source,billing_source_id,created_at")
    .eq("payment_order_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json(
    { order, creditLogs: creditLogs || [] },
    { headers: { "Cache-Control": "no-store" } },
  );
}
