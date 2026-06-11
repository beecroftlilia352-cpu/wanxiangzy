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
  if (!id) return NextResponse.json({ error: "订阅 ID 不能为空" }, { status: 400 });

  const admin = getAdminClient();
  const column = id.startsWith("sub_") ? "stripe_subscription_id" : "id";
  const { data: subscription, error } = await admin
    .from("stripe_subscriptions")
    .select("*")
    .eq(column, id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!subscription) return NextResponse.json({ error: "订阅不存在" }, { status: 404 });

  const { data: orders } = await admin
    .from("payment_orders")
    .select("*")
    .eq("stripe_subscription_id", subscription.stripe_subscription_id)
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json(
    { subscription, orders: orders || [] },
    { headers: { "Cache-Control": "no-store" } },
  );
}
