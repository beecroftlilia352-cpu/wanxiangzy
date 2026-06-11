import { NextResponse } from "next/server";
import { getAppUrl, getStripe } from "@/lib/billing/stripe";
import { getAdminClient } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const { data, error } = await getAdminClient()
      .from("stripe_customers")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data?.stripe_customer_id) {
      return NextResponse.json({ error: "暂无 Stripe 客户记录" }, { status: 404 });
    }

    const session = await getStripe().billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      return_url: `${getAppUrl()}/pricing`,
    });

    return NextResponse.json({ url: session.url }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[billing/portal] error:", error);
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "创建订阅管理入口失败" }, { status: 500 });
  }
}
