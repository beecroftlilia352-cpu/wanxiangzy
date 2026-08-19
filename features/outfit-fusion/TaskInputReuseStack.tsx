"use client";

import { useTranslations } from "next-intl";
import { getImageVariantUrl } from "@/lib/image-variants";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { OutfitFusionAsset } from "@/lib/outfit-fusion";
import { getOutfitFusionRoleLabelKey } from "@/features/outfit-fusion/task-card-helpers";

type Props = {
  assets: OutfitFusionAsset[];
  onReuse: () => void;
};

/**
 * 任务卡片左上角的"输入素材缩略图堆叠"按钮：3 张以内平铺，溢出显示 +N。
 *
 * 整块是个 Tooltip 包裹的按钮；点击触发 onReuse（把 input assets 重新塞回 Composer）。
 */
export function TaskInputReuseStack({ assets, onReuse }: Props) {
  const t = useTranslations("OutfitFusion");
  const displayAssets = assets.slice(0, 3);
  const hiddenCount = Math.max(assets.length - displayAssets.length, 0);
  const hasHiddenAssets = hiddenCount > 0;

  return (
    <div className="hidden w-[68px] shrink-0 sm:block">
      <TooltipProvider delayDuration={120}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onReuse}
              className="group/reuse relative h-[54px] w-[68px] rounded-[6px] outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--codex-accent-45)] focus-visible:ring-offset-2"
              aria-label={t("reuseImages")}
            >
              {displayAssets.map((asset, index) => {
                const label = t("imageNumber", { index: index + 1 });
                const roleLabel = t(getOutfitFusionRoleLabelKey(asset.role));
                return (
                  <span
                    key={asset.id}
                    className={cn(
                      "absolute top-1 h-11 w-8 overflow-hidden rounded border border-white bg-white dark:bg-[var(--codex-surface)] shadow-sm transition duration-300 group-hover/reuse:-translate-y-1 group-hover/reuse:shadow-md group-focus-visible/reuse:-translate-y-1 group-focus-visible/reuse:shadow-md",
                      index === 0 && "left-0 -rotate-6",
                      index === 1 && (hasHiddenAssets ? "left-3.5 rotate-1" : "left-4 rotate-2"),
                      index === 2 && (hasHiddenAssets ? "left-7 rotate-3" : "left-8 rotate-6"),
                    )}
                    title={`${label} · ${roleLabel}`}
                  >
                    <span className="absolute left-0 top-0 z-[1] max-w-full truncate rounded-br-[4px] bg-codex-ink/72 px-1 py-0.5 text-[10px] font-semibold leading-none text-white">
                      {label}
                    </span>
                    <RawPreviewImage src={getImageVariantUrl(asset.url, "thumb")} alt={`${label}${roleLabel}`} className="h-full w-full object-cover" />
                  </span>
                );
              })}
              {hasHiddenAssets ? (
                <span className="absolute right-0 top-1 z-[4] flex h-11 w-8 rotate-6 items-center justify-center overflow-hidden rounded border border-white bg-[linear-gradient(135deg,rgba(31,41,55,0.92),rgba(100,116,139,0.78))] text-[11px] font-bold leading-none text-white shadow-[0_6px_14px_rgba(15,23,42,0.20)] transition duration-300 group-hover/reuse:-translate-y-1 group-hover/reuse:shadow-md group-focus-visible/reuse:-translate-y-1 group-focus-visible/reuse:shadow-md">
                  +{hiddenCount}
                </span>
              ) : null}
            </button>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            align="center"
            sideOffset={6}
            className="rounded bg-codex-ink px-2.5 py-1 text-xs font-medium text-white"
          >
            {t("reuseImages")}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
