"use client";

import { RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { ResultImageGrid } from "@/components/ResultImageGrid";
import { Button } from "@/components/ui/button";
import type { ProductRetouchOutput } from "@/lib/product-retouch";
import type { TaskStatusGroup } from "@/lib/task-queue";
import type { ResourceFavoriteCollectionContext } from "@/components/resource-library/resource-favorite-types";

type ProductRetouchSourceGroupProps = {
  sourceIndex: number;
  aspectRatio: string;
  outputs: ProductRetouchOutput[];
  onPreview: (output: ProductRetouchOutput, outputIndex: number) => void;
  onRetry: (output: ProductRetouchOutput) => void;
  retryingOutputId?: string | null;
  resourceFavorite?: ResourceFavoriteCollectionContext;
};

export function ProductRetouchSourceGroup({
  sourceIndex,
  aspectRatio,
  outputs,
  onPreview,
  onRetry,
  retryingOutputId,
  resourceFavorite,
}: ProductRetouchSourceGroupProps) {
  const t = useTranslations("ProductRetouch");
  const sharedT = useTranslations("Shared");
  const ordered = [...outputs].sort((a, b) => a.variantIndex - b.variantIndex);
  const source = ordered[0];
  if (!source) return null;

  const completedCount = ordered.filter((output) => output.status === "completed").length;
  const failedCount = ordered.filter((output) => output.status === "failed").length;
  const terminal = completedCount + failedCount === ordered.length;
  const terminalCompletedAllOk = terminal && failedCount === 0;
  const statusGroup: TaskStatusGroup = terminal
    ? completedCount > 0 ? "completed" : "failed"
    : ordered.some((output) => output.status === "processing")
      ? "running"
      : "queued";
  const firstFailure = ordered.find((output) => output.status === "failed");

  return (
    <div>
      <ResultImageGrid
        urls={ordered.map((output) => output.resultUrl || "")}
        filenamePrefix={`product-retouch-${sourceIndex + 1}`}
        expectedCount={ordered.length}
        isGenerating={!terminal}
        statusGroup={statusGroup}
        inputReferences={[{ url: source.sourceUrl, label: t("preview.sourceImage") }]}
        variant="task"
        resourceFavorite={resourceFavorite}
        renderKey={`product-retouch-${source.sourceClientId}-${ordered.map((item) => `${item.id}:${item.status}`).join("|")}`}
        imageAltPrefix={`${source.sourceFilename} · ${t("preview.resultPrefix")}`}
        markMissingAsFailed={terminal && !terminalCompletedAllOk}
        markMissingAsCompleted={terminal && terminalCompletedAllOk}
        missingFailureLabel={t("batch.failed")}
        missingFailureDetail={t("batch.failedRetryable")}
        missingFailureActionLabel={sharedT("retryThis")}
        missingFailureActionDisabled={Boolean(retryingOutputId)}
        onMissingFailureAction={(index) => {
          const output = ordered[index];
          if (output?.status === "failed") onRetry(output);
        }}
        onOpen={(_url, index) => {
          const output = ordered[index];
          if (output?.resultUrl) onPreview(output, index);
        }}
        cellLabels={ordered.map((output) => output.validation
          ? `${output.validation.width}×${output.validation.height} · ${output.validation.format.toUpperCase()}`
          : "")}
        tileAspectRatio={aspectRatio || "1/1"}
      />

      {firstFailure && terminal ? (
        <div
          role="alert"
          className="mt-3 flex items-start justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2.5"
        >
          <p className="text-xs leading-5 text-destructive">
            {t("batch.failedRetryable")}
          </p>
          <Button
            variant="destructive"
            size="xs"
            onClick={() => onRetry(firstFailure)}
            disabled={Boolean(retryingOutputId)}
          >
            <RotateCcw className={retryingOutputId === firstFailure.id ? "animate-spin" : ""} />
            {sharedT("retry")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
