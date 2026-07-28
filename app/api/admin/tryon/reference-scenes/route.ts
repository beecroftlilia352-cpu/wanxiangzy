import { isRecord } from "@/lib/utils";
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { getAdminClient } from "@/lib/supabase/admin";
import { isAllowedTryOnReferenceImageUrl } from "@/lib/tryon-reference-admin";

const SCENE_SELECT = [
  "id",
  "scene_key",
  "external_scene_id",
  "name",
  "image_url",
  "status",
  "priority",
  "sort_order",
  "cloth_categories",
  "gender",
  "age_ranges",
  "view_tags",
  "crop_tags",
  "scene_tags",
  "style_tags",
  "lens",
  "posture",
  "prompt_tags",
  "raw_config",
  "created_by",
  "updated_by",
  "created_at",
  "updated_at",
].join(",");

export async function GET(request: Request) {
  const auth = await requireAdminApi("settings:read");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  let query = getAdminClient()
    .from("tryon_reference_scenes")
    .select(SCENE_SELECT)
    .order("sort_order", { ascending: true })
    .order("priority", { ascending: false });

  if (status === "draft" || status === "active" || status === "archived") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, scenes: data || [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi("settings:write");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const normalized = await normalizeScenePayload(body.scene ?? body);
  if (!normalized.ok) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("tryon_reference_scenes")
    .upsert({
      ...normalized.value,
      updated_by: auth.context.userId,
      created_by: normalized.value.created_by || auth.context.userId,
    }, { onConflict: "scene_key" })
    .select(SCENE_SELECT)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await writeAdminAuditLog(auth.context, {
    action: "tryon.reference_scene.upsert",
    resourceType: "tryon_reference_scene",
    resourceId: String((data as { id?: unknown } | null)?.id || normalized.value.scene_key),
    reason: `Upsert try-on reference scene ${normalized.value.scene_key}`,
    metadata: { sceneKey: normalized.value.scene_key, status: normalized.value.status },
  });

  return NextResponse.json({ ok: true, scene: data }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const auth = await requireAdminApi("settings:write");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const sceneKey = readString(body.scene_key ?? body.sceneKey);
  const id = readString(body.id);
  if (!sceneKey && !id) {
    return NextResponse.json({ error: "需要 id 或 scene_key" }, { status: 400 });
  }

  const update: Record<string, unknown> = { updated_by: auth.context.userId };
  const status = readString(body.status);
  if (status) {
    if (status !== "draft" && status !== "active" && status !== "archived") {
      return NextResponse.json({ error: "status 只能是 draft、active 或 archived" }, { status: 400 });
    }
    update.status = status;
  }
  if (body.priority !== undefined) update.priority = Number(body.priority) || 0;
  if (body.sort_order !== undefined || body.sortOrder !== undefined) update.sort_order = Number(body.sort_order ?? body.sortOrder) || 0;

  let query = getAdminClient()
    .from("tryon_reference_scenes")
    .update(update);
  query = id ? query.eq("id", id) : query.eq("scene_key", sceneKey);

  const { data, error } = await query.select(SCENE_SELECT).single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await writeAdminAuditLog(auth.context, {
    action: "tryon.reference_scene.patch",
    resourceType: "tryon_reference_scene",
    resourceId: String((data as { id?: unknown } | null)?.id || sceneKey || id),
    reason: "Patch try-on reference scene",
    metadata: { sceneKey: (data as { scene_key?: unknown } | null)?.scene_key || sceneKey, id, update },
  });

  return NextResponse.json({ ok: true, scene: data }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request) {
  const auth = await requireAdminApi("settings:write");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const sceneKey = searchParams.get("scene_key") || searchParams.get("sceneKey");
  const id = searchParams.get("id");
  if (!sceneKey && !id) {
    return NextResponse.json({ error: "需要 id 或 scene_key" }, { status: 400 });
  }

  let query = getAdminClient()
    .from("tryon_reference_scenes")
    .update({ status: "archived", updated_by: auth.context.userId });
  query = id ? query.eq("id", id) : query.eq("scene_key", sceneKey);
  const finalQuery = query.select("id,scene_key,status").single();
  const { data, error } = await finalQuery;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await writeAdminAuditLog(auth.context, {
    action: "tryon.reference_scene.archive",
    resourceType: "tryon_reference_scene",
    resourceId: String(data?.id || sceneKey || id),
    reason: "Archive try-on reference scene",
    metadata: { sceneKey: data?.scene_key || sceneKey, id },
  });

  return NextResponse.json({ ok: true, scene: data }, { headers: { "Cache-Control": "no-store" } });
}

async function normalizeScenePayload(value: unknown) {
  if (!isRecord(value)) return { ok: false as const, error: "scene 必须是 JSON object" };
  const sceneKey = readString(value.scene_key ?? value.sceneKey);
  const name = readString(value.name);
  const imageUrl = readString(value.image_url ?? value.imageUrl);
  const status = normalizeStatus(readString(value.status));
  const clothCategories = normalizeStringArray(value.cloth_categories ?? value.clothCategories);
  const sceneTags = normalizeStringArray(value.scene_tags ?? value.sceneTags);
  const styleTags = normalizeStringArray(value.style_tags ?? value.styleTags);

  if (!/^[a-z][a-z0-9_-]{2,100}$/.test(sceneKey)) return { ok: false as const, error: "scene_key 格式不正确" };
  if (!name) return { ok: false as const, error: "name 必填" };
  if (!isAllowedTryOnReferenceImageUrl(imageUrl)) return { ok: false as const, error: "image_url 必须是允许的 https/OSS 图片地址" };
  if (status === "active" && !clothCategories.length && !sceneTags.length && !styleTags.length) {
    return { ok: false as const, error: "active 场景至少需要绑定类目或标签" };
  }

  const categoryCheck = await validateEnabledCategories(clothCategories);
  if (!categoryCheck.ok) return categoryCheck;

  return {
    ok: true as const,
    value: {
      scene_key: sceneKey,
      external_scene_id: readNullableString(value.external_scene_id ?? value.externalSceneId),
      name,
      image_url: imageUrl,
      status,
      priority: Number(value.priority) || 0,
      sort_order: Number(value.sort_order ?? value.sortOrder) || 0,
      cloth_categories: clothCategories,
      gender: normalizeGender(readString(value.gender)),
      age_ranges: normalizeAgeRanges(value.age_ranges ?? value.ageRanges),
      view_tags: normalizeStringArray(value.view_tags ?? value.viewTags),
      crop_tags: normalizeStringArray(value.crop_tags ?? value.cropTags),
      scene_tags: sceneTags,
      style_tags: styleTags,
      lens: readNullableString(value.lens),
      posture: readNullableString(value.posture),
      prompt_tags: normalizeStringArray(value.prompt_tags ?? value.promptTags),
      raw_config: isRecord(value.raw_config ?? value.rawConfig) ? value.raw_config ?? value.rawConfig : {},
      created_by: readNullableString(value.created_by),
    },
  };
}

async function validateEnabledCategories(codes: string[]) {
  if (!codes.length) return { ok: true as const };
  const { data, error } = await getAdminClient()
    .from("tryon_clothing_categories")
    .select("code,enabled")
    .in("code", codes);
  if (error) return { ok: false as const, error: error.message };
  const enabled = new Set((data || []).filter((row) => row.enabled !== false).map((row) => row.code));
  const missing = codes.filter((code) => !enabled.has(code));
  if (missing.length) {
    return { ok: false as const, error: `以下类目不存在或未启用：${missing.join(", ")}` };
  }
  return { ok: true as const };
}

function normalizeStatus(value: string) {
  return value === "active" || value === "archived" ? value : "draft";
}

function normalizeGender(value: string) {
  if (value === "women" || value === "men" || value === "unisex") return value;
  return "all";
}

function normalizeAgeRanges(value: unknown) {
  const allowed = new Set(["adult", "teen", "big_child", "middle_child", "small_child", "toddler", "all"]);
  const next = normalizeStringArray(value).filter((item) => allowed.has(item));
  return next.length ? next : ["all"];
}

function normalizeStringArray(value: unknown) {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  return Array.from(new Set(values.map((item) => typeof item === "string" ? item.trim().toLowerCase() : "").filter(Boolean)));
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readNullableString(value: unknown) {
  const text = readString(value);
  return text || null;
}
