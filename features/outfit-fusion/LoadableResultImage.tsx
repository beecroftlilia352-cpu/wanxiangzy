"use client";

import { RawPreviewImage } from "@/components/studio/RawPreviewImage";

type Props = {
  src: string;
  alt: string;
};

/**
 * Result 卡片的图片渲染。
 *
 * 注意：RawPreviewImage 自带 complete/失败重试/淡入三件套，外层不要再叠加
 * onLoad / 骨架状态，否则缓存命中时 onLoad 丢失、骨架会常驻。
 */
export function LoadableResultImage({ src, alt }: Props) {
  return (
    <RawPreviewImage
      eager
      src={src}
      alt={alt}
      className="h-full w-full object-contain transition duration-300 group-hover/slot:scale-[1.012]"
    />
  );
}
