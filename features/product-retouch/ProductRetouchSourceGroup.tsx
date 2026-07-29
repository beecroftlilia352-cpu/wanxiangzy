"use client";

import { RotateCcw } from "lucide-react";
import { ResultImageGrid } from "@/components/ResultImageGrid";
import { Button } from "@/components/ui/button";
import type { ProductRetouchOutput } from "@/lib/product-retouch";
import type { TaskStatusGroup } from "@/lib/task-queue";

type ProductRetouchSourceGroupProps = {
  sourceIndex: number;
  outputs: ProductRetouchOutput[];
  onPreview: (output: ProductRetouchOutput, outputIndex: number) => void;
  onRetry: (output: ProductRetouchOutput) => void;
  retryingOutputId?: string | null;
  downloading?: boolean;
};

export function ProductRetouchSourceGroup({
  sourceIndex,
  outputs,
  onPreview,
  onRetry,
  retryingOutputId,
}: ProductRetouchSourceGroupProps) {
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
          inputReferences={[{ url: source.sourceUrl, label: "商品原图" }]}
          variant="task"
          renderKey={`product-retouch-${source.sourceClientId}-${ordered.map((item) => `${item.id}:${item.status}`).join("|")}`}
          imageAltPrefix={`${source.sourceFilename} 精修结果`}
          markMissingAsFailed={terminal && !terminalCompletedAllOk}
          markMissingAsCompleted={terminal && terminalCompletedAllOk}
          missingFailureLabel="该结果生成失败"
          missingFailureDetail={firstFailure?.error || "可单独重试该结果，不影响本组其他成图。"}
          missingFailureActionLabel="单独重试"
          missingFailureActionDisabled={Boolean(retryingOutputId)}
          onMissingFailureAction={(index) => {
            const output = ordered[index];
            if (output?.status === "failed") onRetry(output);
          }}
          onOpen={(_url, index) => {
            const output = ordered[index];
            if (output?.resultUrl) onPreview(output, index);
          }}
        />

        {firstFailure && terminal ? (
          <div className="mt-3 flex items-start justify-between gap-3 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2">
            <p className="text-xs leading-5 text-destructive">
              {firstFailure.error || "部分结果失败，可单独重试。"}
            </p>
            <Button
              variant="destructive"
              size="xs"
              onClick={() => onRetry(firstFailure)}
              disabled={Boolean(retryingOutputId)}
            >
              <RotateCcw className={retryingOutputId === firstFailure.id ? "animate-spin" : ""} />
              重试
            </Button>
          </div>
        ) : null}
  </div>
  );
}
