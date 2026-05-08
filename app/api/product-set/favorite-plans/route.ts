import { NextRequest, NextResponse } from "next/server";
import { getSupportedImageSizes, normalizeAspectRatio, normalizeImageSize, normalizeLingyaModel, type AspectRatio, type ImageSize, type LingyaModel } from "@/lib/api/lingya";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  normalizeProductSetCreationMode,
  normalizeProductSetImageType,
  normalizeProductSetModuleOverrides,
  normalizeProductSetSettings,
  type ProductSetCreationMode,
  type ProductSetCustomTemplate,
  type ProductSetImageType,
  type ProductSetModuleOverride,
  type ProductSetResolvedTemplate,
  type ProductSetSettings,
} from "@/lib/product-set";

const FAVORITE_PLAN_LIMIT = 24;
const FAVORITE_PLAN_COLUMNS = [
  "id",
  "name",
  "mode",
  "image_type",
  "gen_count",
  "settings",
  "selected_template_ids",
  "custom_templates",
  "module_overrides",
  "ai_model",
  "aspect_ratio",
  "image_size",
  "quality_mode",
  "plan_preview",
  "created_at",
  "updated_at",
].join(",");

type FavoritePlanModule = {
  name: string;
  moduleRole: string;
  aspectRatio: AspectRatio;
  source: ProductSetResolvedTemplate["source"];
  usesModel: boolean;
};

type FavoritePlanRow = {
  id: string;
  name: string;
  mode: ProductSetCreationMode;
  image_type: ProductSetImageType;
  gen_count: number;
  settings: ProductSetSettings;
  selected_template_ids: number[];
  custom_templates: ProductSetCustomTemplate[];
  module_overrides: ProductSetModuleOverride[];
  ai_model: LingyaModel;
  aspect_ratio: AspectRatio;
  image_size: ImageSize;
  quality_mode: "standard" | "advanced";
  plan_preview: FavoritePlanModule[];
  created_at: string;
  updated_at: string;
};

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
  const rows = (Array.isArray(data) ? data : []) as unknown[];
  return NextResponse.json({ plans: rows.map((row) => favoritePlanRowToClient(row as FavoritePlanRow)) });
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

  return NextResponse.json({ plan: favoritePlanRowToClient(data as unknown as FavoritePlanRow) });
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

function normalizeFavoritePlanPayload(value: unknown) {
  if (!isPlainObject(value)) return null;
  const name = typeof value.name === "string" ? value.name.trim().slice(0, 40) : "";
  if (!name) return null;

  const mode = normalizeProductSetCreationMode(value.mode);
  const imageType = normalizeProductSetImageType(value.imageType);
  const aiModel = normalizeLingyaModel(value.aiModel);
  const aspectRatio = normalizeAspectRatio(value.aspectRatio || (imageType === "details" ? "3:4" : "1:1"));
  const imageSize = normalizeImageSize(aiModel, (typeof value.imageSize === "string" ? value.imageSize : "1K") as ImageSize, aspectRatio);
  const qualityMode = value.qualityMode === "advanced" ? "advanced" : "standard";

  return {
    name,
    mode,
    image_type: imageType,
    gen_count: clampPlanCount(value.genCount, imageType),
    settings: normalizeProductSetSettings(value.settings),
    selected_template_ids: normalizeNumberArray(value.selectedTemplateIds).slice(0, 10),
    custom_templates: normalizeCustomTemplates(value.customTemplates),
    module_overrides: normalizeProductSetModuleOverrides(value.moduleOverrides),
    ai_model: aiModel,
    aspect_ratio: aspectRatio,
    image_size: getSupportedImageSizes(aiModel, aspectRatio).includes(imageSize) ? imageSize : "1K",
    quality_mode: qualityMode,
    plan_preview: normalizePlanPreview(value.planPreview),
    updated_at: new Date().toISOString(),
  };
}

function favoritePlanRowToClient(row: FavoritePlanRow) {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    mode: row.mode,
    imageType: row.image_type,
    genCount: row.gen_count,
    settings: row.settings,
    selectedTemplateIds: row.selected_template_ids || [],
    customTemplates: row.custom_templates || [],
    moduleOverrides: row.module_overrides || [],
    aiModel: row.ai_model,
    aspectRatio: row.aspect_ratio,
    imageSize: row.image_size,
    qualityMode: row.quality_mode,
    planPreview: row.plan_preview || [],
  };
}

function normalizeCustomTemplates(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter(isCustomTemplate).slice(0, 10);
}

function isCustomTemplate(value: unknown): value is ProductSetCustomTemplate {
  if (!isPlainObject(value)) return false;
  return typeof value.id === "string" &&
    typeof value.name === "string" &&
    (value.imageType === "main" || value.imageType === "details") &&
    typeof value.typeDescription === "string";
}

function normalizePlanPreview(value: unknown): FavoritePlanModule[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isPlanPreviewModule)
    .map((item) => ({
      name: item.name.slice(0, 40),
      moduleRole: item.moduleRole.slice(0, 120),
      aspectRatio: item.aspectRatio,
      source: item.source,
      usesModel: Boolean(item.usesModel),
    }))
    .slice(0, 12);
}

function isPlanPreviewModule(value: unknown): value is FavoritePlanModule {
  if (!isPlainObject(value)) return false;
  return typeof value.name === "string" &&
    typeof value.moduleRole === "string" &&
    isAspectRatio(value.aspectRatio) &&
    (value.source === "preset" || value.source === "ai" || value.source === "custom");
}

function normalizeNumberArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => Number(item)).filter((item) => Number.isFinite(item));
}

function clampPlanCount(value: unknown, imageType: ProductSetImageType) {
  const raw = typeof value === "number" && Number.isFinite(value) ? value : imageType === "details" ? 5 : 3;
  return Math.min(Math.max(Math.round(raw), 1), imageType === "details" ? 8 : 6);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isAspectRatio(value: unknown): value is AspectRatio {
  return typeof value === "string" && ["4:3", "3:4", "9:16", "16:9", "1:1", "3:2", "2:3", "21:9"].includes(value);
}
