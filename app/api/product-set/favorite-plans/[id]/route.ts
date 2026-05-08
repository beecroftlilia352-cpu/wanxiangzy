import { NextRequest, NextResponse } from "next/server";
import {
  FAVORITE_PLAN_ERRORS,
  FAVORITE_PLAN_TABLE,
  isFavoritePlanId,
} from "@/lib/product-set-favorite";
import { createServerSupabase } from "@/lib/supabase/server";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return favoritePlanError(FAVORITE_PLAN_ERRORS.unauthorized, 401);
  if (!isFavoritePlanId(id)) return favoritePlanError(FAVORITE_PLAN_ERRORS.invalidId, 400);

  const { data, error } = await supabase
    .from(FAVORITE_PLAN_TABLE)
    .delete()
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) return favoritePlanError(error.message, 500);
  if (!data) return favoritePlanError(FAVORITE_PLAN_ERRORS.notFound, 404);
  return NextResponse.json({ ok: true });
}

function favoritePlanError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
