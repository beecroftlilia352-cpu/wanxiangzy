import { NextRequest, NextResponse } from "next/server";
import {
  FAVORITE_PLAN_COLUMNS,
  FAVORITE_PLAN_LIMIT,
  favoritePlanRowToClient,
  normalizeFavoritePlanPayload,
} from "@/lib/product-set-favorite";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { data, error } = await supabase
    .from("product_set_favorite_plans")
    .select(FAVORITE_PLAN_COLUMNS)
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(FAVORITE_PLAN_LIMIT);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = Array.isArray(data) ? data : [];
  return NextResponse.json({ plans: rows.map(favoritePlanRowToClient) });
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const payload = normalizeFavoritePlanPayload(body);
  if (!payload) return NextResponse.json({ error: "收藏方案格式无效" }, { status: 400 });

  const { data, error } = await supabase
    .from("product_set_favorite_plans")
    .upsert({ user_id: user.id, ...payload }, { onConflict: "user_id,name" })
    .select(FAVORITE_PLAN_COLUMNS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await pruneOldFavoritePlans(user.id);

  return NextResponse.json({ plan: favoritePlanRowToClient(data) });
}

async function pruneOldFavoritePlans(userId: string) {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("product_set_favorite_plans")
    .select("id")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .range(FAVORITE_PLAN_LIMIT, FAVORITE_PLAN_LIMIT + 24);

  const ids = (data || []).map((row) => row.id).filter(Boolean);
  if (ids.length) {
    await supabase
      .from("product_set_favorite_plans")
      .delete()
      .eq("user_id", userId)
      .in("id", ids);
  }
}
