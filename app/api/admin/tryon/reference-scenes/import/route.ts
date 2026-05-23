import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { getAdminClient } from "@/lib/supabase/admin";
import { isAllowedTryOnReferenceImageUrl } from "@/lib/tryon-reference-admin";

type ImportRow = Record<string, unknown>;
type ChildRowsByParentId = Map<string, ImportRow[]>;

export async function POST(request: Request) {
  const auth = await requireAdminApi("settings:write");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const publish = body.publish === true;
  const rows = extractImportRows(body);
  const childRowsByParentId = extractChildRowsByParentId(body);
  if (!rows.length) {
    return NextResponse.json({ error: "没有可导入的场景数据，请传 scenes 数组或 rawText" }, { status: 400 });
  }

  const validCategories = await loadEnabledCategoryCodes();
  const successes: ImportRow[] = [];
  const errors: Array<{ index: number; error: string }> = [];

  rows.forEach((row, index) => {
    const parentId = getExternalSceneId(row);
    const normalized = normalizeImportScene(row, index, validCategories, publish, parentId ? childRowsByParentId.get(parentId) || [] : []);
    if (normalized.ok) successes.push(normalized.value);
    else errors.push({ index, error: normalized.error });
  });

  let inserted: unknown[] = [];
  if (successes.length) {
    const { data, error } = await getAdminClient()
      .from("tryon_reference_scenes")
      .upsert(successes, { onConflict: "scene_key" })
      .select("id,scene_key,name,status,cloth_categories");
    if (error) {
      return NextResponse.json({ error: error.message, parsedCount: rows.length, validCount: successes.length, errors }, { status: 400 });
    }
    inserted = data || [];
  }

  await writeAdminAuditLog(auth.context, {
    action: "tryon.reference_scenes.import",
    resourceType: "tryon_reference_scene",
    reason: "Import try-on reference scenes",
    metadata: {
      parsedCount: rows.length,
      successCount: successes.length,
      errorCount: errors.length,
      publish,
      childParentCount: childRowsByParentId.size,
    },
  });

  return NextResponse.json({
    ok: true,
    parsedCount: rows.length,
    successCount: successes.length,
    errorCount: errors.length,
    childParentCount: childRowsByParentId.size,
    errors,
    scenes: inserted,
  }, { headers: { "Cache-Control": "no-store" } });
}

function extractImportRows(body: Record<string, unknown>) {
  if (Array.isArray(body.scenes)) return body.scenes.filter(isRecord) as ImportRow[];
  const rawText = typeof body.rawText === "string" ? body.rawText : typeof body.raw_text === "string" ? body.raw_text : "";
  if (!rawText.trim()) return [];
  const parsed = safeParseJson(rawText);
  const parsedRows = extractRowsFromParsed(parsed);
  if (parsedRows.length) return parsedRows;
  return rawText
    .split(/\n+/)
    .map((line) => safeParseJson(line.trim()))
    .flatMap(extractRowsFromParsed);
}

function extractRowsFromParsed(parsed: unknown): ImportRow[] {
  if (Array.isArray(parsed)) return parsed.filter(isRecord) as ImportRow[];
  if (!isRecord(parsed)) return [];
  if (Array.isArray(parsed.scenes)) return parsed.scenes.filter(isRecord) as ImportRow[];
  if (Array.isArray(parsed.list)) return parsed.list.filter(isRecord) as ImportRow[];
  if (Array.isArray(parsed.data)) return parsed.data.filter(isRecord) as ImportRow[];
  if (isRecord(parsed.data)) {
    if (Array.isArray(parsed.data.list)) return parsed.data.list.filter(isRecord) as ImportRow[];
    const values = Object.values(parsed.data).flatMap((value) => {
      if (Array.isArray(value)) return value.filter(isRecord) as ImportRow[];
      return isRecord(value) ? [value] : [];
    });
    if (values.length) return values;
  }
  return [parsed];
}

function extractChildRowsByParentId(body: Record<string, unknown>) {
  const map: ChildRowsByParentId = new Map();
  collectChildRows(body.children, map);
  collectChildRows(body.childScenes, map);
  collectChildRows(body.child_scenes, map);

  const rawText = readFirstBodyString(body, ["childRawText", "childrenRawText", "child_raw_text", "children_raw_text"]);
  if (rawText) {
    collectChildRows(safeParseJson(rawText), map);
  }

  return map;
}

function collectChildRows(source: unknown, map: ChildRowsByParentId, fallbackParentId?: string) {
  if (!source) return;
  if (typeof source === "string") {
    collectChildRows(safeParseJson(source), map, fallbackParentId);
    return;
  }
  if (Array.isArray(source)) {
    source.filter(isRecord).forEach((row) => collectChildRow(row, map, fallbackParentId));
    return;
  }
  if (!isRecord(source)) return;

  if (isRecord(source.data)) {
    for (const [parentId, value] of Object.entries(source.data)) {
      collectChildRows(value, map, parentId);
    }
    return;
  }
  if (Array.isArray(source.children)) {
    collectChildRows(source.children, map, getExternalSceneId(source) || fallbackParentId);
    return;
  }
  if (Array.isArray(source.list)) {
    collectChildRows(source.list, map, fallbackParentId);
    return;
  }

  collectChildRow(source, map, fallbackParentId);
}

function collectChildRow(row: ImportRow, map: ChildRowsByParentId, fallbackParentId?: string) {
  if (Array.isArray(row.children)) {
    collectChildRows(row.children, map, getExternalSceneId(row) || fallbackParentId);
    return;
  }
  const parentId = readFirstString(row, ["parentId", "parent_id"]) || fallbackParentId;
  if (!parentId) return;
  map.set(parentId, [...(map.get(parentId) || []), row]);
}

function normalizeImportScene(row: ImportRow, index: number, validCategories: Set<string>, publish: boolean, childRows: ImportRow[] = []) {
  const extInfo = readRecord(row.extInfo);
  const imageUrl = readFirstString(row, ["image_url", "imageUrl", "url", "image", "cover_url", "coverUrl", "showImage"]);
  const name = readFirstString(row, ["name", "title", "label", "sceneName"]) || `系统参考图 ${index + 1}`;
  if (!imageUrl) return { ok: false as const, error: "缺少 image_url/url" };
  if (!isAllowedTryOnReferenceImageUrl(imageUrl)) return { ok: false as const, error: "image_url 不在允许域名或 OSS 域名内" };

  const externalId = getExternalSceneId(row);
  const sceneKey = slugify(readFirstString(row, ["scene_key", "sceneKey"]) || `${externalId || name}-${shortHash(imageUrl)}`);
  const childCategories = childRows.flatMap((child) => {
    const childExtInfo = readRecord(child.extInfo);
    return readStringArray(child.geminiClothCategory ?? child.gemini_cloth_category ?? child.cloth_categories ?? child.clothCategories ?? child.category ?? childExtInfo.geminiClothCategory ?? childExtInfo.clothCategory);
  });
  const rawCategories = readStringArray(row.geminiClothCategory ?? row.gemini_cloth_category ?? row.cloth_categories ?? row.clothCategories ?? row.category ?? extInfo.geminiClothCategory ?? extInfo.clothCategory);
  const clothCategories = Array.from(new Set(rawCategories.map(normalizeCode).filter((code) => validCategories.has(code))));
  childCategories.map(normalizeCode).filter((code) => validCategories.has(code)).forEach((code) => {
    if (!clothCategories.includes(code)) clothCategories.push(code);
  });

  const typeTags = [
    ...readStringArray(row.type),
    ...childRows.flatMap((child) => readStringArray(child.type)),
  ];
  const lens = readFirstString(row, ["lens"]) || readFirstString(extInfo, ["lens"]) || firstMatchingTag(typeTags, ["front view", "back view", "upper body", "whole body", "lower body"]);
  const posture = readFirstString(row, ["posture"]) || readFirstString(extInfo, ["posture"]);

  const status = publish ? "active" : normalizeStatus(readFirstString(row, ["status"]));
  if (status === "active" && !clothCategories.length && !readStringArray(row.tags).length && !readStringArray(row.scene_tags ?? row.sceneTags).length && !typeTags.length) {
    return { ok: false as const, error: "active 场景至少需要绑定类目或标签" };
  }

  return {
    ok: true as const,
    value: {
      scene_key: sceneKey,
      external_scene_id: externalId || null,
      name,
      image_url: imageUrl,
      status,
      priority: Number(row.priority ?? row.weight ?? 0) || 0,
      sort_order: Number(row.sort_order ?? row.sortOrder ?? row.order ?? index + 1) || index + 1,
      cloth_categories: clothCategories,
      gender: normalizeGender(readFirstString(row, ["gender", "genderType"]) || firstMatchingTag(typeTags, ["female", "male", "common"])),
      age_ranges: readStringArray(row.age_ranges ?? row.ageRanges).length ? readStringArray(row.age_ranges ?? row.ageRanges) : normalizeAgeRanges(typeTags),
      view_tags: normalizeTags(row.view_tags ?? row.viewTags ?? row.view ?? typeTags.filter(isViewTag)),
      crop_tags: normalizeTags(row.crop_tags ?? row.cropTags ?? row.crop ?? typeTags.filter(isCropTag)),
      scene_tags: normalizeTags(row.scene_tags ?? row.sceneTags ?? row.type ?? row.tags),
      style_tags: normalizeTags(row.style_tags ?? row.styleTags ?? row.styleType ?? typeTags.filter((tag) => !isViewTag(tag) && !isCropTag(tag))),
      lens: lens || null,
      posture: posture || null,
      prompt_tags: normalizeTags(row.prompt_tags ?? row.promptTags),
      raw_config: childRows.length ? { ...row, children: sortChildRows(childRows) } : row,
    },
  };
}

async function loadEnabledCategoryCodes() {
  const { data } = await getAdminClient()
    .from("tryon_clothing_categories")
    .select("code")
    .eq("enabled", true);
  return new Set((data || []).map((row) => String(row.code)));
}

function safeParseJson(value: string): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function readFirstBodyString(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function readFirstString(row: ImportRow, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function readRecord(value: unknown): ImportRow {
  return isRecord(value) ? value : {};
}

function readStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => typeof item === "string" ? item.trim() : String(item || "").trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value.split(/[,\n|]+/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function normalizeTags(value: unknown) {
  return Array.from(new Set(readStringArray(value).map((item) => item.toLowerCase().replace(/\s+/g, "_"))));
}

function normalizeAgeRanges(tags: string[]) {
  const normalized = tags.map((tag) => tag.toLowerCase());
  if (normalized.includes("adult")) return ["adult"];
  if (normalized.includes("child") || normalized.includes("kid")) return ["child"];
  if (normalized.includes("teen") || normalized.includes("teenager")) return ["teen"];
  return ["adult"];
}

function normalizeCode(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function normalizeStatus(value: string) {
  if (value === "PROD" || value === "prod" || value === "published") return "active";
  return value === "active" || value === "archived" ? value : "draft";
}

function normalizeGender(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === "women" || normalized === "female") return "women";
  if (normalized === "men" || normalized === "male") return "men";
  if (normalized === "unisex" || normalized === "common") return "unisex";
  return "all";
}

function slugify(value: string) {
  const slug = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return slug && /^[a-z]/.test(slug) ? slug.slice(0, 100) : `scene_${shortHash(value)}`;
}

function shortHash(value: string) {
  return createHash("sha1").update(value).digest("hex").slice(0, 10);
}

function getExternalSceneId(row: ImportRow) {
  return readFirstString(row, ["scene_id", "sceneId", "external_scene_id", "externalSceneId", "id"]);
}

function firstMatchingTag(tags: string[], candidates: string[]) {
  const normalizedCandidates = new Set(candidates.map((item) => item.toLowerCase()));
  return tags.find((tag) => normalizedCandidates.has(tag.toLowerCase())) || "";
}

function isViewTag(value: string) {
  const normalized = value.toLowerCase();
  return normalized === "front view" || normalized === "back view" || normalized === "side view";
}

function isCropTag(value: string) {
  const normalized = value.toLowerCase();
  return normalized === "whole body" || normalized === "upper body" || normalized === "lower body" || normalized === "half body";
}

function sortChildRows(rows: ImportRow[]) {
  return [...rows].sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0));
}

function isRecord(value: unknown): value is ImportRow {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
