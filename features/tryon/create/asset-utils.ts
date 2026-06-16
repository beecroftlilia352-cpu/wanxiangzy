import type { AnalysisCacheKeyParams, SelectedReferenceImage } from "./types";

export function createPlaceholderFile(name: string) {
  return new File([], name, { type: "image/jpeg" });
}

export function normalizeAssetUrl(value?: string | null) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`.toLowerCase();
  } catch {
    return value.split("?")[0].trim().toLowerCase();
  }
}

export function sameAssetUrl(left?: string | null, right?: string | null) {
  const normalizedLeft = normalizeAssetUrl(left);
  const normalizedRight = normalizeAssetUrl(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

export function uniqueReferenceImages(refs: SelectedReferenceImage[], maxCount = 8) {
  const seen = new Set<string>();
  const unique: SelectedReferenceImage[] = [];
  for (const ref of refs) {
    if (!ref?.url || seen.has(ref.url)) continue;
    seen.add(ref.url);
    unique.push(ref);
    if (unique.length >= maxCount) break;
  }
  return unique;
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
) {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, limit), items.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }));
  return results;
}

export function buildClothingAnalysisKey(params: AnalysisCacheKeyParams) {
  return JSON.stringify({
    urls: params.urls.filter(Boolean).map((url) => normalizeAssetUrl(url) || url),
    clothingMode: params.clothingMode,
    clothingRoles: params.clothingRoles,
    garmentAudience: params.garmentAudience,
    ageGroup: params.ageGroup,
  });
}

export function buildReferenceAnalysisKey(params: AnalysisCacheKeyParams) {
  return JSON.stringify({
    urls: params.urls.filter(Boolean).map((url) => normalizeAssetUrl(url) || url),
    clothingMode: params.clothingMode,
    clothingRoles: [...new Set(params.clothingRoles)].sort(),
    garmentAudience: params.garmentAudience,
    ageGroup: params.ageGroup,
  });
}
