"use client";

import { useTranslations } from "next-intl";
import { ResolutionSelector } from "@/components/studio/ResolutionSelector";
import type { ResolutionOption } from "@/components/studio/ResolutionSelector";
import type { ImageSize } from "@/lib/api/lingya";

type Props = {
  imageSize: ImageSize;
  imageSizeOptions: ResolutionOption<ImageSize>[];
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
    <ResolutionSelector
      titleKey="resolution.title"
      options={imageSizeOptions}
      value={imageSize}
      onChange={onChangeImageSize}
      ariaLabel={t("resolution.title")}
    />
  );
}