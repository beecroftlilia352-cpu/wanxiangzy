"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ChevronDown,
  Clapperboard,
  Copy,
  Eye,
  Loader2,
  PenLine,
  RefreshCw,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  StudioBatchDownloadButton,
  StudioSingleDownloadButton,
} from "@/components/studio/StudioMediaDownloadButton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn, generateDownloadFilename } from "@/lib/utils";
import { buildSourceImageHref } from "@/lib/studio-image-preview";
import type { TaskStatusGroup } from "@/lib/task-queue";
import type { OutfitFusionAsset, OutfitFusionConfig } from "@/lib/outfit-fusion";
import { LoadableResultImage } from "@/features/outfit-fusion/LoadableResultImage";
import { OutfitFusionFocusAction } from "@/features/outfit-fusion/OutfitFusionFocusAction";
import { TaskInputReuseStack } from "@/features/outfit-fusion/TaskInputReuseStack";
import { getOutfitFusionTaskGridClass } from "@/features/outfit-fusion/task-card-helpers";

export type OutfitFusionTask = {
  id: string;
  remoteId?: string | null;
  taskNo: string;
  templateId?: string | null;
  createdAt: string;
  statusGroup: TaskStatusGroup;
  progress: number;
  prompt: string;
  requestPrompt: string;
  inputAssets: OutfitFusionAsset[];
  config: OutfitFusionConfig;
  expectedCount: number;
  resultUrls: string[];
  error?: string | null;
};

type Props = {
  task: OutfitFusionTask;
  index: number;
  onPreview: (index: number) => void;
  onReedit: () => void;
  onReuseInputs: () => void;
  onRegenerate: () => void;
  onCopy: () => void;
  onDelete: () => void;
  formatTaskTime: (value: string) => string;
};

/**
 * Outfit fusion 单条任务卡片：
 *   - 顶部：输入素材缩略图堆 + prompt（可展开）
 *   - 中间：N 格 result 网格（已完成/失败/等待三种态）
 *   - 底部：时间 / 任务号 / 重新编辑 / 重新生成 / 删除
 *
 * 状态由父级持有（task prop），所有按钮通过回调通知。
 * 跳转类动作（修图 / AI 视频 / 下载）通过 useRouter 直接处理。
 */
export function OutfitFusionTaskCard({
  task,
  index,
  onPreview,
  onReedit,
  onReuseInputs,
  onRegenerate,
  onCopy,
  onDelete,
  formatTaskTime,
}: Props) {
  const t = useTranslations("OutfitFusion");
  const sharedT = useTranslations("Shared");
  const router = useRouter();
  const running = task.statusGroup === "running" || task.statusGroup === "queued";
  const failed = task.statusGroup === "failed";
  const slots = Math.max(task.expectedCount, task.resultUrls.length, 1);
  const displaySlots = slots;
  const [promptExpanded, setPromptExpanded] = useState(false);
  const canExpandPrompt = task.prompt.length > 64;
  const openImageRepair = (url: string) => {
    router.push(buildSourceImageHref("/general-image/image-to-image", url));
  };
  const openAiVideo = (url: string) => {
    router.push(buildSourceImageHref("/video", url));
  };
  return (
    <article
      className="animate-slide-up rounded-[8px] bg-white dark:bg-[var(--codex-surface)] p-3 shadow-sm ring-1 ring-[var(--codex-border)] transition duration-300 hover:shadow-[0_14px_34px_rgba(15,23,42,0.09)] motion-reduce:animate-none sm:p-4"
      style={{ animationDelay: `${Math.min(index * 40, 160)}ms` }}
    >
      <div className="flex items-start gap-1.5">
        <TaskInputReuseStack assets={task.inputAssets} onReuse={onReuseInputs} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1.5">
            <p className={cn("min-w-0 flex-1 whitespace-pre-wrap break-words text-[14px] leading-[23px] tracking-normal text-codex-ink dark:text-white", !promptExpanded && "line-clamp-2")}>
              {task.prompt}
            </p>
            {canExpandPrompt ? (
              <button
                type="button"
                onClick={() => setPromptExpanded((value) => !value)}
                className="mt-0.5 inline-flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-medium text-[var(--codex-accent)] transition hover:bg-[var(--codex-accent-08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--codex-accent-35)]"
                aria-expanded={promptExpanded}
              >
                {promptExpanded ? t("collapsePrompt") : t("expandPrompt")}
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", promptExpanded && "rotate-180")} />
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <TooltipProvider delayDuration={120}>
        <div className={cn("mt-3 grid w-full gap-3 sm:gap-4", getOutfitFusionTaskGridClass(displaySlots))}>
          {Array.from({ length: displaySlots }, (_, slotIndex) => {
            const url = task.resultUrls[slotIndex];
            return url ? (
              <div
                key={`${task.id}-${slotIndex}`}
                role="button"
                tabIndex={0}
                aria-label={t("previewResult", { index: slotIndex + 1 })}
                title={t("previewResult", { index: slotIndex + 1 })}
                onClick={() => onPreview(slotIndex)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  onPreview(slotIndex);
                }}
                className="studio-result-card studio-result-card-ready outfit-fusion-result-card group/slot relative aspect-[3/4] cursor-zoom-in overflow-hidden rounded bg-[#f4f6fa] text-sm text-codex-faint dark:text-codex-muted outline-none transition duration-300 hover:z-[1] hover:shadow-[0_10px_28px_rgba(15,23,42,0.18)] focus-visible:ring-2 focus-visible:ring-[var(--codex-accent-35)] focus-visible:ring-offset-2"
              >
                <LoadableResultImage src={url} alt={t("resultImageAlt", { index: slotIndex + 1 })} />
                <span className="pointer-events-none absolute left-2 top-2 rounded bg-[var(--codex-accent)] px-1.5 py-0.5 text-[11px] font-semibold leading-4 text-white shadow-sm">
                  {slotIndex + 1}/{slots}
                </span>
                <div className="studio-result-focus-layer" aria-hidden={false}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="studio-result-focus-view inline-flex h-8 items-center gap-1.5 px-3"
                    onClick={(event) => {
                      event.stopPropagation();
                      onPreview(slotIndex);
                    }}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <Eye className="h-4 w-4" />
                    {t("view")}
                  </Button>
                  <div className="studio-result-focus-actions">
                    <OutfitFusionFocusAction
                      label={t("previewActions.repair")}
                      onClick={() => openImageRepair(url)}
                      icon={<WandSparkles className="h-3.5 w-3.5" />}
                    />
                    <OutfitFusionFocusAction
                      label={t("previewActions.aiVideo")}
                      onClick={() => openAiVideo(url)}
                      icon={<Clapperboard className="h-3.5 w-3.5" />}
                    />
                    <StudioSingleDownloadButton
                      url={url}
                      filename={generateDownloadFilename("outfit-fusion", slotIndex, "png")}
                      label={t("download")}
                      errorFallback={sharedT("downloadFailed")}
                      showLabel={false}
                      variant="ghost"
                      size="sm"
                      className="studio-result-focus-action h-8 w-8 rounded-full p-0"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div
                key={`${task.id}-${slotIndex}`}
                role="status"
                aria-live="polite"
                className="studio-result-card studio-result-card-pending-shell group/slot relative aspect-[3/4] overflow-hidden bg-white dark:bg-[var(--codex-surface)] text-sm text-white"
              >
                <div
                  className={cn(
                    "gen-card studio-result-pending-card outfit-fusion-pending-card relative z-[1] flex h-full w-full flex-col items-center justify-center gap-2",
                    failed && "studio-result-pending-card-failed",
                  )}
                >
                  {failed ? (
                    <span className="text-xs font-semibold text-red-50">{t("taskGenerateFailed")}</span>
                  ) : (
                    <>
                      <div className="relative flex h-14 w-14 items-center justify-center">
                        <span className="gen-ring absolute inset-0 rounded-full bg-[#aeb8ff]/45" />
                        <div className="relative flex h-14 w-14 items-center justify-center rounded-full border border-white/16 bg-white/10 shadow-lg backdrop-blur-md">
                          <Loader2 className="h-6 w-6 animate-spin text-white" />
                        </div>
                      </div>
                      <p className="relative z-[1] text-xs font-semibold text-white/90">{t("generatingWait")}</p>
                      <p className="relative z-[1] text-[11px] font-medium text-white/80">{t("generatingIndex", { index: slotIndex + 1 })}</p>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </TooltipProvider>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs leading-5 text-codex-faint dark:text-codex-muted">
        <div className="flex flex-wrap items-center gap-2">
          <span>{formatTaskTime(task.createdAt)}</span>
          <span>|</span>
          <span>{t("taskLabel", { id: task.remoteId || task.taskNo })}</span>
          <button
            type="button"
            onClick={onCopy}
            className="rounded p-0.5 text-codex-faint dark:text-codex-muted transition hover:bg-[var(--codex-surface-soft)] hover:text-codex-ink dark:hover:bg-white/10 dark:hover:text-stone-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--codex-accent-35)]"
            aria-label={t("copyTaskId")}
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          {running ? <span className="text-[var(--codex-accent)]">{task.progress}%</span> : null}
        </div>
        <div className="flex items-center gap-3">
          {task.resultUrls.length > 1 ? (
            <StudioBatchDownloadButton
              urls={task.resultUrls}
              filename={`pixel-diffusion-outfit-${task.id.slice(0, 8)}`}
              label={`${t("download")} ZIP`}
              resultLabel={t("download")}
              size="sm"
              variant="ghost"
              className="h-7 rounded px-2 text-xs font-semibold text-[var(--codex-accent)]"
            />
          ) : null}
          <button
            type="button"
            onClick={onReedit}
            className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-codex-ink dark:text-stone-300 transition hover:bg-[var(--codex-accent-08)] hover:text-[var(--codex-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--codex-accent-35)]"
          >
            <PenLine className="h-3.5 w-3.5" />
            {t("reedit")}
          </button>
          <button
            type="button"
            onClick={onRegenerate}
            disabled={running}
            className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-codex-ink dark:text-stone-300 transition hover:bg-[var(--codex-accent-08)] hover:text-[var(--codex-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--codex-accent-35)] disabled:text-codex-faint dark:text-codex-muted"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t("regenerate")}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-codex-muted dark:text-codex-faint transition hover:bg-[var(--codex-accent-08)] hover:text-[var(--codex-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--codex-accent-35)]"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t("delete")}
          </button>
        </div>
      </div>
    </article>
  );
}
