import { isRecord } from "@/lib/utils";
import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/auth";
import { writeAdminAuditLog } from "@/lib/admin/audit";
import { getAdminClient } from "@/lib/supabase/admin";
import {
  TRYON_CLOTHING_CATEGORY_SEED,
  serializeTryOnCategorySeedForDb,
} from "@/lib/tryon-reference-config";

const CATEGORY_SELECT = [
  "id",
  "code",
  "parent_code",
  "level",
  "name_zh",
  "name_en",
  "slot",
  "is_intimate",
  "aliases",
  "recognition_labels",
  "default_view_tags",
  "default_crop_tags",
  "enabled",
  "sort_order",
  "metadata",
  "created_at",
  "updated_at",
].join(",");

export async function GET() {
  const auth = await requireAdminApi("settings:read");
  if (!auth.ok) return auth.response;

  const { data, error } = await getAdminClient()
    .from("tryon_clothing_categories")
    .select(CATEGORY_SELECT)
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, categories: data || [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireAdminApi("settings:write");
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const admin = getAdminClient();

  if (body.seedDefaults === true) {
    const rows = TRYON_CLOTHING_CATEGORY_SEED.map(serializeTryOnCategorySeedForDb);
    const { data, error } = await admin
      .from("tryon_clothing_categories")
      .upsert(rows, { onConflict: "code" })
      .select(CATEGORY_SELECT);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    await writeAdminAuditLog(auth.context, {
      action: "tryon.categories.seed_defaults",
      resourceType: "tryon_clothing_category",
      reason: "Seed default try-on clothing categories",
      metadata: { count: rows.length },
    });
    return NextResponse.json({ ok: true, categories: data || [] }, { headers: { "Cache-Control": "no-store" } });
  }

  const category = normalizeCategoryPayload(body.category ?? body);
  if (!category.ok) {
    return NextResponse.json({ error: category.error }, { status: 400 });
  }

  const { data, error } = await admin
    .from("tryon_clothing_categories")
    .upsert(category.value, { onConflict: "code" })
    .select(CATEGORY_SELECT)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await writeAdminAuditLog(auth.context, {
    action: "tryon.category.upsert",
    resourceType: "tryon_clothing_category",
    resourceId: String((data as { id?: unknown } | null)?.id || category.value.code),
    reason: `Upsert try-on clothing category ${category.value.code}`,
    metadata: { code: category.value.code, parentCode: category.value.parent_code },
  });

  return NextResponse.json({ ok: true, category: data }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request) {
  const auth = await requireAdminApi("settings:write");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const code = readString(searchParams.get("code"));
  if (!code) {
    return NextResponse.json({ error: "需要 code" }, { status: 400 });
  }

  const { data, error } = await getAdminClient()
    .from("tryon_clothing_categories")
    .update({ enabled: false })
    .eq("code", code)
    .select("id,code,enabled")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await writeAdminAuditLog(auth.context, {
    action: "tryon.category.disable",
    resourceType: "tryon_clothing_category",
    resourceId: String((data as { id?: unknown } | null)?.id || code),
    reason: `Disable try-on clothing category ${code}`,
    metadata: { code },
  });

  return NextResponse.json({ ok: true, category: data }, { headers: { "Cache-Control": "no-store" } });
}

function normalizeCategoryPayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false as const, error: "category 必须是 JSON object" };
  }
  const record = value as Record<string, unknown>;
  const code = readString(record.code);
  const parentCode = readOptionalString(record.parent_code ?? record.parentCode);
  const level = Number(record.level);
  const nameZh = readString(record.name_zh ?? record.nameZh);
  const nameEn = readString(record.name_en ?? record.nameEn);
  const slot = readString(record.slot);
  if (!/^[a-z][a-z0-9_]{1,80}$/.test(code)) return { ok: false as const, error: "code 格式不正确" };
  if (level !== 1 && level !== 2) return { ok: false as const, error: "level 只能是 1 或 2" };
  if (level === 2 && !parentCode) return { ok: false as const, error: "二级类目必须填写 parent_code" };
  if (!nameZh || !nameEn) return { ok: false as const, error: "name_zh/name_en 必填" };
  if (!["upper", "lower", "single", "outer", "intimate", "functional"].includes(slot)) {
    return { ok: false as const, error: "slot 不合法" };
  }

  return {
    ok: true as const,
    value: {
      code,
      parent_code: parentCode,
      level,
      name_zh: nameZh,
      name_en: nameEn,
      slot,
      is_intimate: Boolean(record.is_intimate ?? record.isIntimate),
      aliases: readJsonArray(record.aliases),
      recognition_labels: readJsonArray(record.recognition_labels ?? record.recognitionLabels),
      default_view_tags: readStringArray(record.default_view_tags ?? record.defaultViewTags),
      default_crop_tags: readStringArray(record.default_crop_tags ?? record.defaultCropTags),
      enabled: record.enabled !== false,
      sort_order: Number(record.sort_order ?? record.sortOrder) || 0,
      metadata: isRecord(record.metadata) ? record.metadata : {},
    },
  };
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalString(value: unknown) {
  const text = readString(value);
  return text || null;
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(readString).filter(Boolean) : [];
}

function readJsonArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}
