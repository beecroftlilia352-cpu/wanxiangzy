import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { API_RATE_LIMITS, enforceApiRateLimit } from "@/lib/api/rate-limit";
import { resourceLibraryErrorResponse } from "@/lib/resource-library/http";
import { listResourceLibraryFacets } from "@/lib/resource-library/server";
import { getResourceLibraryModuleLabel } from "@/lib/resource-library/types";

export async function GET() {
  try {
    const { supabase, user, response } = await requireApiUser();
    if (!user) return response;
    const rateLimit = await enforceApiRateLimit(user.id, API_RATE_LIMITS.historyRead);
    if (rateLimit) return rateLimit;

    const facets = await listResourceLibraryFacets(supabase);
    const modules = aggregateFacets(
      facets.filter((facet) => facet.moduleKey),
      (facet) => facet.moduleKey || "",
      (key) => getResourceLibraryModuleLabel(key),
    );
    const media = aggregateFacets(facets, (facet) => facet.mediaType);
    const views = aggregateFacets(facets, (facet) => facet.view);
    return NextResponse.json({ facets, modules, media, views }, {
      headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=20" },
    });
  } catch (error) {
    return resourceLibraryErrorResponse(error, "资源分类加载失败");
  }
}

function aggregateFacets<T>(
  facets: T[],
  getKey: (facet: T) => string,
  getLabel: (key: string) => string = (key) => key,
) {
  const counts = new Map<string, number>();
  for (const facet of facets) {
    const key = getKey(facet);
    if (key) counts.set(key, (counts.get(key) || 0) + Number((facet as { total?: unknown }).total || 0));
  }
  return Array.from(counts, ([key, count]) => ({ key, label: getLabel(key), count }));
}
