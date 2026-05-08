import type { HistoryJobPayload } from "@/lib/history-apply";

export type TryOnSourceLibraryRow = {
  id?: string | null;
  created_at?: string | null;
  result_urls?: string[] | null;
  job_payload?: HistoryJobPayload | Record<string, unknown> | null;
};

export type TryOnSourceLibraryItem = {
  id: string;
  generationId: string;
  url: string;
  label: string;
  createdAt: string | null;
  moduleLabel: string;
};

const MODULE_LABELS: Record<string, string> = {
  tryon: "服装上身",
  grass: "服装种草",
  productSet: "商品套图",
  modelBackground: "模特换背景",
  generalImage: "通用生图",
  pose: "姿势裂变",
  model: "专属模特",
  garment3d: "服装 3D",
  faceSwap: "AI 换脸",
};

export function getTryOnSourceLibraryItems(rows: TryOnSourceLibraryRow[], maxItems = 48): TryOnSourceLibraryItem[] {
  const items: TryOnSourceLibraryItem[] = [];
  const seenUrls = new Set<string>();

  for (const row of rows) {
    if (!row?.id || !Array.isArray(row.result_urls)) continue;
    const moduleKind = typeof row.job_payload?.kind === "string" ? row.job_payload.kind : "作品";
    const moduleLabel = MODULE_LABELS[moduleKind] || "作品";

    row.result_urls.forEach((url, index) => {
      if (typeof url !== "string" || !url.trim() || seenUrls.has(url)) return;
      seenUrls.add(url);
      items.push({
        id: `${row.id}:${index}`,
        generationId: row.id || "",
        url,
        label: row.result_urls && row.result_urls.length > 1 ? `${moduleLabel} ${index + 1}` : moduleLabel,
        createdAt: row.created_at || null,
        moduleLabel,
      });
    });

    if (items.length >= maxItems) break;
  }

  return items.slice(0, maxItems);
}
