import { NextResponse } from "next/server";
import { getBillingCatalog } from "@/lib/billing/repository";
import { getAdminClient } from "@/lib/supabase/admin";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET() {
  const catalog = await getBillingCatalog();
  const activeSubscription = await loadActiveSubscription().catch(() => null);

  return NextResponse.json(
    { ...catalog, activeSubscription },
    { headers: { "Cache-Control": "no-store" } }
  );
}

async function loadActiveSubscription() {
  const supabase = await createServerSupabase({ readonlyCookies: true });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await getAdminClient()
    .from("stripe_subscriptions")
    .select("id,product_id,price_id,status,cancel_at_period_end,current_period_end")
    .eq("user_id", user.id)
    .in("status", ["active", "trialing", "past_due"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data || null;
}
