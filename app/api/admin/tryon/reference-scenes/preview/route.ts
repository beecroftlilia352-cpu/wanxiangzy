import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  normalizeTryOnClothingAnalysis,
  normalizeTryOnReferenceScene,
  recommendTryOnReferenceScenes,
  referenceSceneToSelectedReference,
  type TryOnReferenceScene,
} from "@/lib/tryon-reference-config";
import { normalizeTryOnAgeGroup, normalizeTryOnGarmentAudience } from "@/lib/tryon-prompt";

export async function POST(request: Request) {
  const auth = await requireAdminApi("settings:read");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const includeDraft = body.includeDraft === true || body.include_draft === true;
  const analysis = normalizeTryOnClothingAnalysis(body.analysis || {
    mainCategory: typeof body.mainCategory === "string" ? body.mainCategory : body.main_category,
    subcategories: Array.isArray(body.subcategories) ? body.subcategories : typeof body.subcategory === "string" ? [body.subcategory] : [],
    slot: body.slot,
  });
  const garmentAudience = normalizeTryOnGarmentAudience(body.garment_audience ?? body.garmentAudience);
  const ageGroup = normalizeTryOnAgeGroup(body.age_group ?? body.ageGroup);

  const query = getAdminClient()
    .from("tryon_reference_scenes")
    .select("id,scene_key,external_scene_id,name,image_url,status,priority,sort_order,cloth_categories,gender,age_ranges,view_tags,crop_tags,scene_tags,style_tags,lens,posture,prompt_tags,raw_config")
    .in("status", includeDraft ? ["active", "draft"] : ["active"])
    .order("sort_order", { ascending: true })
    .order("priority", { ascending: false });
  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const scenes = ((data || []).map(normalizeTryOnReferenceScene).filter(Boolean) as TryOnReferenceScene[])
    .map((scene) => includeDraft && scene.status === "draft" ? { ...scene, status: "active" as const } : scene);
  const result = recommendTryOnReferenceScenes({
    scenes,
    analysis,
    garmentAudience,
    ageGroup,
  });

  return NextResponse.json({
    ok: true,
    input: { analysis, garmentAudience, ageGroup, includeDraft },
    safetyBlocked: result.safetyBlocked,
    recommended: result.recommended.map(serializePreviewScene),
    all: result.all.map(serializePreviewScene),
  }, { headers: { "Cache-Control": "no-store" } });
}

function serializePreviewScene(scene: ReturnType<typeof recommendTryOnReferenceScenes>["recommended"][number]) {
  return {
    id: scene.id || scene.sceneKey,
    sceneKey: scene.sceneKey,
    name: scene.name,
    imageUrl: scene.imageUrl,
    status: scene.status,
    score: scene.score,
    matchReasons: scene.matchReasons,
    clothCategories: scene.clothCategories,
    gender: scene.gender,
    ageRanges: scene.ageRanges,
    viewTags: scene.viewTags,
    cropTags: scene.cropTags,
    reference: referenceSceneToSelectedReference(scene),
  };
}
