import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";

type Params = {
  params: Promise<{ sessionId: string }>;
};

export async function GET(_request: Request, { params }: Params) {
  try {
    const { sessionId } = await params;
    if (!sessionId || !sessionId.startsWith("cs_")) {
      return NextResponse.json({ error: "sessionId 不合法" }, { status: 400 });
    }

    const supabase = await createServerSupabase({ readonlyCookies: true });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const { data, error } = await getAdminClient()
      .from("payment_orders")
      .select("id,status,mode,currency,amount_total,credits_expected,credits_granted,credit_grant_status,created_at,updated_at")
      .eq("stripe_checkout_session_id", sessionId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "订单不存在" }, { status: 404 });

    return NextResponse.json({ order: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[billing/orders/session] error:", error);
    }
    return NextResponse.json({ error: "订单状态加载失败" }, { status: 500 });
  }
}
