import { NextResponse } from "next/server";
import { getPublishedModelProviderRawValue } from "@/lib/api/model-provider-registry.server";

const IMAGE_MODELS = ["nano-banana-2", "gpt-image-2", "nano-banana-pro"] as const;

// 短 TTL 内存缓存：管理端模型开关低频变更，60s 内直接复用，
// 避免每个 studio 页面加载都打一次 Supabase admin_config_versions 查询。
const CATALOG_CACHE_TTL_MS = 60_000;
let catalogCache: { models: readonly string[]; at: number } | null = null;

export async function GET() {
  const now = Date.now();
  if (catalogCache && now - catalogCache.at < CATALOG_CACHE_TTL_MS) {
    return NextResponse.json(
      { ok: true, models: catalogCache.models },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const raw = await getPublishedModelProviderRawValue();
  const models = raw && typeof raw.models === "object" && !Array.isArray(raw.models) ? raw.models as Record<string, unknown> : {};

  const visible = IMAGE_MODELS.filter((model) => {
    const entry = models[model];
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      return (entry as Record<string, unknown>).enabled !== false;
    }
    return true;
  });

  catalogCache = { models: visible, at: now };

  return NextResponse.json(
    { ok: true, models: visible },
    { headers: { "Cache-Control": "no-store" } },
  );
}
