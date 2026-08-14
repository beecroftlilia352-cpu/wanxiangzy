/* eslint-disable @next/next/no-img-element, jsx-a11y/alt-text */
"use client";

import { useState } from "react";
import type { ImgHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type RawPreviewImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "alt"> & {
  alt: string;
};

// 图片加载失败的优雅占位：浅灰底 + 细线"图片"图标，替代浏览器默认裂图
const ERROR_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Crect width='400' height='400' fill='%23eef1f6'/%3E%3Cg fill='none' stroke='%23b3bcc9' stroke-width='9' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='96' y='116' width='208' height='168' rx='14'/%3E%3Ccircle cx='156' cy='172' r='20'/%3E%3Cpath d='M112 262l56-54 44 40 36-32 44 46'/%3E%3C/g%3E%3C/svg%3E";

export function RawPreviewImage(props: RawPreviewImageProps) {
  // Studio previews can be blob/data URLs or user/provider URLs that should not go through Next image optimization.
  // Default to lazy + async decoding (below-fold previews); callers can override via {...props}.
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <img
      {...props}
      loading="lazy"
      decoding="async"
      src={failed ? ERROR_PLACEHOLDER : props.src}
      onLoad={() => setLoaded(true)}
      onError={() => {
        setFailed(true);
        setLoaded(true);
      }}
      className={cn(
        // 加载中：透明 + 浅灰底；完成后 300ms 淡入并移除灰底
        "transition-opacity duration-300",
        loaded ? "opacity-100" : "opacity-0 bg-slate-100/70",
        props.className,
      )}
    />
  );
}
