"use client";

import { useTranslations } from "next-intl";
import { Monitor } from "lucide-react";
import { StudioOptionGrid } from "@/components/studio/StudioFormControls";
import type { ImageSize } from "@/lib/api/lingya";

type Props = {
  imageSize: ImageSize;
  imageSizeOptions: { value: ImageSize; label: string }[];
  onChangeImageSize: (value: ImageSize) => void;
};

/**
 * 分辨率选择（仅在 imageSizeOptions 多于一项时显示）。
 *
 * 受控组件：父组件持有 imageSize 状态并决定是否渲染（外层仍以
 * `imageSizes.length > 1` 守卫，因此组件本身不处理隐藏逻辑）。
 */
export function ResolutionSection({ imageSize, imageSizeOptions, onChangeImageSize }: Props) {
  const t = useTranslations("Create");

  return (
    <section>
      <h3 className="font-bold text-sm mb-3 flex items-center gap-2 text-codex-ink">
        <Monitor className="h-4 w-4 text-[var(--codex-accent)]" /> {t("resolution.title")}
      </h3>
      <StudioOptionGrid
        options={imageSizeOptions}
        value={imageSize}
        onChange={onChangeImageSize}
        ariaLabel={t("resolution.title")}
      />
    </section>
  );
}