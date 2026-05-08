import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

const FAVORITE_REFERENCE_LIMIT = 24;
const FAVORITE_REFERENCE_COLUMNS = [
  "id",
  "url",
  "label",
  "category",
  "created_at",
  "updated_at",
].join(",");

type ReferenceFavoriteCategory = "scene" | "style" | "pose";

type ReferenceFavoriteRow = {
  id: string;
  url: string;
  label: string;
  category: ReferenceFavoriteCategory;
  created_at: string;
  updated_at: string;
};

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { data, error } = await supabase
    .from("tryon_reference_favorites")
    .select(FAVORITE_REFERENCE_COLUMNS)
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(FAVORITE_REFERENCE_LIMIT);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (Array.isArray(data) ? data : []) as unknown[];
  return NextResponse.json({
    favorites: rows.map((row) => favoriteReferenceRowToClient(row as ReferenceFavoriteRow)),
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const payload = normalizeFavoriteReferencePayload(body);
  if (!payload) return NextResponse.json({ error: "收藏参考图格式无效" }, { status: 400 });

  const { data, error } = await supabase
    .from("tryon_reference_favorites")
    .upsert({ user_id: user.id, ...payload }, { onConflict: "user_id,url" })
    .select(FAVORITE_REFERENCE_COLUMNS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await pruneOldReferenceFavorites(user.id);

  return NextResponse.json({
    favorite: favoriteReferenceRowToClient(data as unknown as ReferenceFavoriteRow),
  });
}

async function pruneOldReferenceFavorites(userId: string) {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("tryon_reference_favorites")
    .select("id")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .range(FAVORITE_REFERENCE_LIMIT, FAVORITE_REFERENCE_LIMIT + 24);

  const ids = (data || []).map((row) => row.id).filter(Boolean);
  if (ids.length) {
    await supabase
      .from("tryon_reference_favorites")
      .delete()
      .eq("user_id", userId)
      .in("id", ids);
  }
}

function normalizeFavoriteReferencePayload(value: unknown) {
  if (!isPlainObject(value)) return null;
  const url = typeof value.url === "string" ? value.url.trim() : "";
  if (!url) return null;

  const label = typeof value.label === "string" && value.label.trim()
    ? value.label.trim().slice(0, 40)
    : "收藏参考图";

  return {
    url,
    label,
    category: normalizeReferenceCategory(value.category),
    updated_at: new Date().toISOString(),
  };
}

function favoriteReferenceRowToClient(row: ReferenceFavoriteRow) {
  return {
    id: row.id,
    url: row.url,
    label: row.label,
    category: normalizeReferenceCategory(row.category),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeReferenceCategory(value: unknown): ReferenceFavoriteCategory {
  return value === "style" || value === "pose" || value === "scene" ? value : "scene";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
