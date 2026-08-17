import type { ResourceFavoriteDescriptor, ResourceFavoriteIdentity } from "@/components/resource-library/resource-favorite-types";
import type { ResourceLibraryAsset } from "@/lib/resource-library/types";

export type ResourceFavoriteStatus = ResourceFavoriteIdentity & {
  assetId: string | null;
  saved: boolean;
};

export async function requestResourceFavoriteStatuses(
  descriptors: ResourceFavoriteDescriptor[],
  signal?: AbortSignal,
): Promise<ResourceFavoriteStatus[]> {
  const response = await fetch("/api/resource-library/assets/status", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: descriptors.map(({ generationId, resultIndex }) => ({ generationId, resultIndex })),
    }),
    signal,
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(readError(payload, "资源收藏状态加载失败"));

  const rows = Array.isArray(payload.items) ? payload.items : [];
  return descriptors.map((descriptor, index) => {
    const row = isRecord(rows[index]) ? rows[index] : {};
    return {
      generationId: descriptor.generationId,
      resultIndex: descriptor.resultIndex,
      assetId: typeof row.assetId === "string" && row.assetId ? row.assetId : null,
      saved: row.saved === true,
    };
  });
}

export async function saveResourceFavorite(descriptor: ResourceFavoriteDescriptor) {
  const response = await fetch("/api/resource-library/assets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      generationId: descriptor.generationId,
      resultIndex: descriptor.resultIndex,
    }),
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(readError(payload, "加入资源库失败"));

  const assets = Array.isArray(payload.assets) ? payload.assets as ResourceLibraryAsset[] : [];
  const exact = assets.find((asset) =>
    asset.sourceGenerationId === descriptor.generationId
      && Number(asset.sourceResultIndex) === descriptor.resultIndex,
  ) || assets[0];
  const assetId = typeof exact?.id === "string" && exact.id ? exact.id : null;
  if (!assetId) throw new Error("资源库返回结果无效");
  return assetId;
}

export async function removeResourceFavorite(assetId: string) {
  const response = await fetch(`/api/resource-library/assets/${encodeURIComponent(assetId)}`, {
    method: "DELETE",
  });
  const payload = await readJson(response);
  if (!response.ok) throw new Error(readError(payload, "移出资源库失败"));
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const value = await response.json().catch(() => ({}));
  return isRecord(value) ? value : {};
}

function readError(payload: Record<string, unknown>, fallback: string) {
  return typeof payload.error === "string" && payload.error.trim() ? payload.error : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
