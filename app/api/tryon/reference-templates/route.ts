import { NextRequest, NextResponse } from "next/server";
import { API_RATE_LIMITS, enforceApiRateLimit } from "@/lib/api/rate-limit";
import { createServerSupabase } from "@/lib/supabase/server";

const TEMPLATE_LIMIT = 24;
const TEMPLATE_COLUMNS = [
  "id",
  "name",
  "reference_items",
  "cover_url",
  "created_at",
  "updated_at",
].join(",");

type TemplateReferenceCategory = "scene" | "style" | "pose";
type TemplateReference = {
  id: string;
  url: string;
  label: string;
  category: TemplateReferenceCategory;
  source: "preset" | "upload" | "favorite" | "history" | "template";
};

type TemplateRow = {
  id: string;
  name: string;
  reference_items?: unknown;
  references?: unknown;
  cover_url: string;
  created_at: string;
  updated_at: string;
};

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { data, error } = await supabase
    .from("tryon_reference_templates")
    .select(TEMPLATE_COLUMNS)
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(TEMPLATE_LIMIT);

  if (error) {
    if (isMissingTemplateTable(error)) return NextResponse.json({ templates: [] });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (Array.isArray(data) ? data : []) as unknown as TemplateRow[];
  return NextResponse.json({
    templates: rows
      .map(templateRowToClient)
      .filter(Boolean),
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const rateLimit = await enforceApiRateLimit(user.id, API_RATE_LIMITS.favoriteMutation);
  if (rateLimit) return rateLimit;

  const body = await request.json().catch(() => null);
  const references = normalizeReferences((body as Record<string, unknown> | null)?.references);
  if (!references.length) return NextResponse.json({ error: "请先选择参考图" }, { status: 400 });

  const name = typeof (body as Record<string, unknown> | null)?.name === "string"
    && String((body as Record<string, unknown>).name).trim()
    ? String((body as Record<string, unknown>).name).trim().slice(0, 60)
    : `参考模板 ${references.length} 张`;

  const { data, error } = await supabase
    .from("tryon_reference_templates")
    .insert({
      user_id: user.id,
      name,
      reference_items: references,
      cover_url: references[0].url,
      updated_at: new Date().toISOString(),
    })
    .select(TEMPLATE_COLUMNS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await pruneOldTemplates(user.id);

  return NextResponse.json({ template: templateRowToClient(data as unknown as TemplateRow) });
}

async function pruneOldTemplates(userId: string) {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("tryon_reference_templates")
    .select("id")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .range(TEMPLATE_LIMIT, TEMPLATE_LIMIT + 24);

  const ids = (data || []).map((row) => row.id).filter(Boolean);
  if (ids.length) {
    await supabase
      .from("tryon_reference_templates")
      .delete()
      .eq("user_id", userId)
      .in("id", ids);
  }
}

function templateRowToClient(row: TemplateRow) {
  const references = normalizeReferences(row.reference_items ?? row.references);
  if (!references.length) return null;
  return {
    id: row.id,
    name: row.name || `参考模板 ${references.length} 张`,
    references,
    coverUrl: row.cover_url || references[0].url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeReferences(value: unknown): TemplateReference[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const refs: TemplateReference[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const url = typeof record.url === "string" ? record.url.trim() : "";
    if (!url || seen.has(url)) continue;
    seen.add(url);
    refs.push({
      id: typeof record.id === "string" && record.id.trim() ? record.id.trim() : `template-ref-${refs.length + 1}`,
      url,
      label: typeof record.label === "string" && record.label.trim() ? record.label.trim().slice(0, 40) : `参考图${refs.length + 1}`,
      category: normalizeCategory(record.category),
      source: normalizeSource(record.source),
    });
    if (refs.length >= 8) break;
  }
  return refs;
}

function normalizeCategory(value: unknown): TemplateReferenceCategory {
  return value === "style" || value === "pose" || value === "scene" ? value : "scene";
}

function normalizeSource(value: unknown): TemplateReference["source"] {
  return value === "preset" || value === "upload" || value === "favorite" || value === "history" || value === "template"
    ? value
    : "template";
}

function isMissingTemplateTable(error: { code?: string; message?: string }) {
  const message = `${error.code || ""} ${error.message || ""}`.toLowerCase();
  return message.includes("42p01") || message.includes("tryon_reference_templates") && message.includes("does not exist");
}
