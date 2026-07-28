"use client";

import { StudioEmptyState } from "@/components/studio/StudioEmptyState";
import type { ProductRetouchBatch, ProductRetouchOutput } from "@/lib/product-retouch";
import type { ProductRetouchFilter } from "@/features/product-retouch/ProductRetouchBatchToolbar";
import { ProductRetouchSourceGroup } from "@/features/product-retouch/ProductRetouchSourceGroup";

type ProductRetouchBatchGridProps = {
  batch: ProductRetouchBatch;
  filter: ProductRetouchFilter;
  onPreview: (output: ProductRetouchOutput, outputIndex: number) => void;
  onRetry: (output: ProductRetouchOutput) => void;
  onDownloadGroup: (sourceIndex: number, outputs: ProductRetouchOutput[]) => void;
  retryingOutputId?: string | null;
  downloadingSourceIndex?: number | null;
};

export function ProductRetouchBatchGrid({
  batch,
  filter,
  onPreview,
  onRetry,
  onDownloadGroup,
  retryingOutputId,
  downloadingSourceIndex,
}: ProductRetouchBatchGridProps) {
  const groups = groupOutputs(batch.outputs)
    .filter(([, outputs]) => matchesFilter(outputs, filter));

  if (!groups.length) {
    return (
      <StudioEmptyState
        title="没有符合筛选条件的商品"
        description="切换上方状态筛选，查看其他商品的生产结果。"
      />
    );
  }

  return (
    <div className="space-y-4 pb-8">
      {groups.map(([sourceIndex, outputs]) => (
        <ProductRetouchSourceGroup
          key={sourceIndex}
          sourceIndex={sourceIndex}
          outputs={outputs}
          onPreview={onPreview}
          onRetry={onRetry}
          onDownload={() => onDownloadGroup(sourceIndex, outputs)}
          retryingOutputId={retryingOutputId}
          downloading={downloadingSourceIndex === sourceIndex}
        />
      ))}
    </div>
  );
}

function groupOutputs(outputs: ProductRetouchOutput[]) {
  const grouped = new Map<number, ProductRetouchOutput[]>();
  for (const output of outputs) {
    const items = grouped.get(output.sourceIndex) || [];
    items.push(output);
    grouped.set(output.sourceIndex, items);
  }
  return [...grouped.entries()].sort(([a], [b]) => a - b);
}

function matchesFilter(
  outputs: ProductRetouchOutput[],
  filter: ProductRetouchFilter,
) {
  if (filter === "all") return true;
  if (filter === "running") {
    return outputs.some((output) => output.status === "queued" || output.status === "processing");
  }
  return outputs.some((output) => output.status === filter);
}
