import { NextRequest, NextResponse } from "next/server";
import {
  FAVORITE_PLAN_COLUMNS,
  FAVORITE_PLAN_ERRORS,
  FAVORITE_PLAN_LIMIT,
  FAVORITE_PLAN_TABLE,
  favoritePlanRowToClient,
  normalizeFavoritePlanPayload,
} from "@/lib/product-set-favorite";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return favoritePlanError(FAVORITE_PLAN_ERRORS.unauthorized, 401);

  const { data, error } = await supabase
    .from(FAVORITE_PLAN_TABLE)
    .select(FAVORITE_PLAN_COLUMNS)
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(FAVORITE_PLAN_LIMIT);

  if (error) return favoritePlanError(error.message, 500);
  const rows = Array.isArray(data) ? data : [];
  return NextResponse.json({ plans: rows.map(favoritePlanRowToClient) });
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return favoritePlanError(FAVORITE_PLAN_ERRORS.unauthorized, 401);

  const body = await request.json().catch(() => null);
  const payload = normalizeFavoritePlanPayload(body);
  if (!payload) return favoritePlanError(FAVORITE_PLAN_ERRORS.invalidPayload, 400);

  const { data, error } = await supabase
    .from(FAVORITE_PLAN_TABLE)
    .upsert({ user_id: user.id, ...payload }, { onConflict: "user_id,name" })
    .select(FAVORITE_PLAN_COLUMNS)
    .single();

  if (error) return favoritePlanError(error.message, 500);
  await pruneOldFavoritePlans(user.id);

  return NextResponse.json({ plan: favoritePlanRowToClient(data) });
}

async function pruneOldFavoritePlans(userId: string) {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from(FAVORITE_PLAN_TABLE)
    .select("id")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .range(FAVORITE_PLAN_LIMIT, FAVORITE_PLAN_LIMIT + 24);

  const ids = (data || []).map((row) => row.id).filter(Boolean);
  if (ids.length) {
    await supabase
      .from(FAVORITE_PLAN_TABLE)
      .delete()
      .eq("user_id", userId)
      .in("id", ids);
  }
}

function favoritePlanError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
