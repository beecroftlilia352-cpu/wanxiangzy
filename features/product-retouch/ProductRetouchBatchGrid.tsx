"use client";

import { useTranslations } from "next-intl";

import { StudioEmptyState } from "@/components/studio/StudioEmptyState";
import type { ProductRetouchBatch, ProductRetouchOutput } from "@/lib/product-retouch";
import { ProductRetouchSourceGroup } from "@/features/product-retouch/ProductRetouchSourceGroup";

type ProductRetouchBatchGridProps = {
  batch: ProductRetouchBatch;
  onPreview: (output: ProductRetouchOutput, outputIndex: number) => void;
  onRetry: (output: ProductRetouchOutput) => void;
  retryingOutputId?: string | null;
  downloadingSourceIndex?: number | null;
};

export function ProductRetouchBatchGrid({
  batch,
  onPreview,
  onRetry,
  retryingOutputId,
  downloadingSourceIndex,
}: ProductRetouchBatchGridProps) {
  const t = useTranslations("ProductRetouch");
  const groups = groupOutputs(batch.outputs);

  if (!groups.length) {
    return (
      <StudioEmptyState
        title={t("empty.title")}
        description={t("empty.description")}
      />
    );
  }

  return (
    <div className="space-y-4 pb-8">
      {groups.map(([sourceIndex, outputs]) => (
        <ProductRetouchSourceGroup
          key={sourceIndex}
          sourceIndex={sourceIndex}
          aspectRatio={batch.aspectRatio}
          outputs={outputs}
          onPreview={onPreview}
          onRetry={onRetry}
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
