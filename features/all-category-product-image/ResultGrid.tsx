"use client";

import { Download, Loader2, RefreshCw, X, ZoomIn } from "lucide-react";
import { useTranslations } from "next-intl";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";
import { getImageVariantUrl } from "@/lib/image-variants";
import {
  getAspectRatioLabel,
  type ResultSlot,
} from "@/features/all-category-product-image/shared";
import { IconButton } from "@/features/all-category-product-image/IconButton";

type Props = {
  slots: ResultSlot[];
  regeneratingIndex: number | null;
  onPreview: (url: string, title: string, index: number) => void;
  onDownload: (url: string, index: number) => void;
  onRegenerate: (index: number) => void;
};

/**
 * 生成完成后的卡片网格：
 * - 每张卡片 = 3:4 主图 + 标题 + 状态
 * - 主图区域悬浮显示 zoom / download / regenerate 三个圆按钮
 * - 失败时显示红色 X + 错误文案
 * - 未到达时显示旋转 loader
 */
export function ResultGrid({
  slots,
  regeneratingIndex,
  onPreview,
  onDownload,
  onRegenerate,
}: Props) {
  const t = useTranslations("AllCategoryProduct");
  return (
    <div className="mt-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-codex-ink">{t("generationDoneTitle")}</h3>
          <p className="mt-1 text-xs text-codex-muted">{t("generationDoneSub")}</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {slots.map((slot, index) => (
          <article
            key={`${slot.module.id}-${index}`}
            className="overflow-hidden rounded-lg border border-[var(--codex-border)] bg-white"
          >
            <div className="relative aspect-[3/4] bg-[var(--codex-surface-soft)]">
              {slot.url ? (
                <RawPreviewImage
                  src={getImageVariantUrl(slot.url, "card")}
                  alt={slot.module.title}
                  className="h-full w-full object-contain"
                />
              ) : slot.status === "failed" ? (
                <div className="flex h-full flex-col items-center justify-center px-6 text-center text-red-500">
                  <X aria-hidden="true" className="h-7 w-7" />
                  <p className="mt-3 text-sm font-black">{t("generationFailedTitle")}</p>
                  <p className="mt-1 text-xs leading-5">{slot.error || t("trySingleRegenerate")}</p>
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-codex-muted">
                  <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin" />
                  <p className="mt-3 text-sm font-black">{t("waitingResult")}</p>
                </div>
              )}
              {slot.url && (
                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-codex-ink/0 opacity-0 transition hover:bg-codex-ink/35 hover:opacity-100">
                  <IconButton
                    label={t("previewMode")}
                    onClick={() => onPreview(slot.url!, slot.module.title, index)}
                    icon={<ZoomIn aria-hidden="true" className="h-4 w-4" />}
                  />
                  <IconButton
                    label={t("actionDownload")}
                    onClick={() => onDownload(slot.url!, index)}
                    icon={<Download aria-hidden="true" className="h-4 w-4" />}
                  />
                  <IconButton
                    label={t("regenerate")}
                    onClick={() => onRegenerate(index)}
                    icon={
                      regeneratingIndex === index ? (
                        <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw aria-hidden="true" className="h-4 w-4" />
                      )
                    }
                  />
                </div>
              )}
            </div>
            <div className="p-3">
              <h4 className="truncate text-sm font-black text-codex-ink">{slot.module.title}</h4>
              <p className="mt-1 text-xs font-semibold text-codex-muted">
                {slot.url
                  ? t("regenerated")
                  : slot.status === "failed"
                    ? t("failedStatus")
                    : t("generatingStatus")}{" "}
                · {getAspectRatioLabel(slot.module.aspectRatio, t)}
              </p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}