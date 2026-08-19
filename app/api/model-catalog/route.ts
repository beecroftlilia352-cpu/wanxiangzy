import { NextResponse } from "next/server";
import { getAiControlPlaneConfig } from "@/lib/ai-control-plane/server";
import {
  LEGACY_IMAGE_MODEL_CATALOG,
  type ImageModelCatalogItem,
} from "@/lib/image-model-catalog";
import type { PricedImageSize } from "@/lib/model-pricing";

// 短 TTL 内存缓存：管理端模型开关低频变更，60s 内直接复用，
// 避免每个 studio 页面加载都打一次 Supabase admin_config_versions 查询。
const CATALOG_CACHE_TTL_MS = 15_000;
let catalogCache: { catalog: ImageModelCatalogItem[]; at: number } | null = null;

export async function GET() {
  const now = Date.now();
  if (catalogCache && now - catalogCache.at < CATALOG_CACHE_TTL_MS) {
    return NextResponse.json(
      { ok: true, models: catalogCache.catalog.map((item) => item.id), catalog: catalogCache.catalog },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const config = await getAiControlPlaneConfig({ allowLegacy: true });
  const catalog = config
    ? config.models
        .filter((model) => model.modality === "image" && model.enabled && model.userVisible)
        .map((model): ImageModelCatalogItem | null => {
          const creditPrices = normalizePrices(model.creditPrices);
          const supportedSizes = (Object.keys(creditPrices) as PricedImageSize[])
            .filter((size) => creditPrices[size] !== undefined);
          if (!supportedSizes.length || !config.deployments.some((deployment) => deployment.modelId === model.id && deployment.enabled)) return null;
          return {
            id: model.id,
            displayName: model.displayName,
            description: model.description,
            creditPrices,
            supportedSizes,
            capabilities: model.capabilities,
            shortTitle: model.presentation?.shortTitle,
            badge: model.presentation?.badge,
            iconUrl: model.presentation?.iconUrl,
            coverUrl: model.presentation?.coverUrl,
            group: model.presentation?.group,
            tags: model.presentation?.tags,
            sortOrder: model.presentation?.sortOrder,
            featured: model.presentation?.featured,
            locales: model.presentation?.locales,
          };
        })
        .filter((item): item is ImageModelCatalogItem => Boolean(item))
        .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || (a.sortOrder ?? 100) - (b.sortOrder ?? 100) || a.displayName.localeCompare(b.displayName))
    : LEGACY_IMAGE_MODEL_CATALOG;

  catalogCache = { catalog, at: now };

  return NextResponse.json(
    { ok: true, models: catalog.map((item) => item.id), catalog },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function normalizePrices(value?: Record<string, number>): Partial<Record<PricedImageSize, number>> {
  const result: Partial<Record<PricedImageSize, number>> = {};
  for (const size of ["1K", "2K", "4K"] as const) {
    const price = value?.[size];
    if (typeof price === "number" && Number.isFinite(price) && price > 0) result[size] = price;
  }
  return result;
}
