import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { API_RATE_LIMITS, enforceApiRateLimit } from "@/lib/api/rate-limit";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  fallbackTryOnReferenceScenes,
  normalizeTryOnClothingAnalysis,
  normalizeTryOnReferenceScene,
  recommendTryOnReferenceScenes,
  referenceSceneToSelectedReference,
  type TryOnReferenceScene,
} from "@/lib/tryon-reference-config";
import { normalizeTryOnAgeGroup, normalizeTryOnGarmentAudience } from "@/lib/tryon-prompt";

const CACHE_TTL_MS = 60_000;

let sceneCache: { loadedAt: number; source: "published" | "db" | "fallback"; scenes: TryOnReferenceScene[]; version: ReferenceConfigVersion | null } | null = null;

type ReferenceConfigVersion = {
  id: string;
  publishedAt: string | null;
  createdAt: string | null;
};

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const rateLimit = await enforceApiRateLimit(auth.user.id, API_RATE_LIMITS.tryonReferenceRecommendations);
  if (rateLimit) return rateLimit;

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const analysis = body.analysis ? normalizeTryOnClothingAnalysis(body.analysis) : null;
  const garmentAudience = normalizeTryOnGarmentAudience(body.garment_audience);
  const ageGroup = normalizeTryOnAgeGroup(body.age_group);
  const selectedCount = Number(body.selected_count) || 0;

  const sceneBundle = await loadActiveReferenceScenes();
  const result = recommendTryOnReferenceScenes({
    scenes: sceneBundle.scenes,
    analysis,
    garmentAudience,
    ageGroup,
  });

  return NextResponse.json({
    ok: true,
    source: sceneBundle.source,
    configVersion: sceneBundle.version,
    selectedCount,
    safetyBlocked: result.safetyBlocked,
    recommended: result.recommended.map(serializeRecommendation),
    all: result.all.map(serializeRecommendation),
  }, { headers: { "Cache-Control": "no-store" } });
}

async function loadActiveReferenceScenes() {
  const now = Date.now();
  if (sceneCache && now - sceneCache.loadedAt < CACHE_TTL_MS) {
    return sceneCache;
  }

  try {
    const snapshot = await loadPublishedReferenceConfigSnapshot();
    if (snapshot?.scenes.length) {
      sceneCache = { loadedAt: now, source: "published", scenes: snapshot.scenes, version: snapshot.version };
      return sceneCache;
    }

    const { data, error } = await getAdminClient()
      .from("tryon_reference_scenes")
      .select("id,scene_key,external_scene_id,name,image_url,status,priority,sort_order,cloth_categories,gender,age_ranges,view_tags,crop_tags,scene_tags,style_tags,lens,posture,prompt_tags,raw_config")
      .eq("status", "active")
      .order("sort_order", { ascending: true })
      .order("priority", { ascending: false });

    if (!error && Array.isArray(data)) {
      const scenes = data.map(normalizeTryOnReferenceScene).filter(Boolean) as TryOnReferenceScene[];
      if (scenes.length) {
        sceneCache = { loadedAt: now, source: "db", scenes, version: await loadPublishedReferenceConfigVersion() };
        return sceneCache;
      }
    }
  } catch {
    // fall through to built-in presets
  }

  sceneCache = { loadedAt: now, source: "fallback", scenes: fallbackTryOnReferenceScenes(), version: await loadPublishedReferenceConfigVersion() };
  return sceneCache;
}

async function loadPublishedReferenceConfigSnapshot(): Promise<{ version: ReferenceConfigVersion; scenes: TryOnReferenceScene[] } | null> {
  try {
    const { data, error } = await getAdminClient()
      .from("admin_config_versions")
      .select("id,published_at,created_at,value")
      .eq("config_key", "tryon.reference_config")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    const value = data.value as { scenes?: unknown[] } | null;
    const scenes = Array.isArray(value?.scenes)
      ? (value.scenes.map(normalizeTryOnReferenceScene).filter(Boolean) as TryOnReferenceScene[]).filter((scene) => scene.status === "active")
      : [];
    return {
      version: {
        id: String(data.id),
        publishedAt: typeof data.published_at === "string" ? data.published_at : null,
        createdAt: typeof data.created_at === "string" ? data.created_at : null,
      },
      scenes,
    };
  } catch {
    return null;
  }
}

async function loadPublishedReferenceConfigVersion(): Promise<ReferenceConfigVersion | null> {
  try {
    const { data, error } = await getAdminClient()
      .from("admin_config_versions")
      .select("id,published_at,created_at")
      .eq("config_key", "tryon.reference_config")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return {
      id: String(data.id),
      publishedAt: typeof data.published_at === "string" ? data.published_at : null,
      createdAt: typeof data.created_at === "string" ? data.created_at : null,
    };
  } catch {
    return null;
  }
}

function serializeRecommendation(scene: ReturnType<typeof recommendTryOnReferenceScenes>["recommended"][number]) {
  return {
    id: scene.id || scene.sceneKey,
    sceneKey: scene.sceneKey,
    name: scene.name,
    imageUrl: scene.imageUrl,
    reference: referenceSceneToSelectedReference(scene),
    score: scene.score,
    matchReasons: scene.matchReasons,
    clothCategories: scene.clothCategories,
    gender: scene.gender,
    ageRanges: scene.ageRanges,
    viewTags: scene.viewTags,
    cropTags: scene.cropTags,
    sceneTags: scene.sceneTags,
    styleTags: scene.styleTags,
    childReferences: extractChildReferences(scene),
  };
}

function extractChildReferences(scene: TryOnReferenceScene) {
  const raw = scene.rawConfig || {};
  const children = Array.isArray(raw.children) ? raw.children : [];
  const childRefs = children
    .map((child, index) => {
      if (!child || typeof child !== "object") return null;
      const record = child as Record<string, unknown>;
      const url = typeof record.showImage === "string" ? record.showImage
        : typeof record.image_url === "string" ? record.image_url
          : typeof record.imageUrl === "string" ? record.imageUrl
            : "";
      if (!url) return null;
      return {
        id: String(record.id || `${scene.sceneKey}-child-${index + 1}`),
        url,
        label: typeof record.name === "string" && record.name.trim() ? record.name.trim() : `${scene.name} ${index + 1}`,
        category: "scene" as const,
        is_preset: true,
        user_id: null,
        source: "preset",
      };
    })
    .filter(Boolean);

  const extInfo = raw.extInfo && typeof raw.extInfo === "object" ? raw.extInfo as Record<string, unknown> : {};
  const showImgs = parseJsonStringArray(extInfo.showImgs);
  const showImgRefs = showImgs.map((url, index) => ({
    id: `${scene.sceneKey}-show-img-${index + 1}`,
    url,
    label: `${scene.name} ${index + 1}`,
    category: "scene" as const,
    is_preset: true,
    user_id: null,
    source: "preset",
  }));

  const seen = new Set<string>();
  return [...childRefs, ...showImgRefs].filter((item) => {
    if (!item || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  }).slice(0, 48);
}

function parseJsonStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  }
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}
