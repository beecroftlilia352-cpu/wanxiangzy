/* eslint-disable @next/next/no-img-element, jsx-a11y/alt-text */
"use client";

import { useRef, useState } from "react";
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
  // 偶发网络失败自动重试一次；仍失败后显示占位（点击占位可手动重载）
  const retryCountRef = useRef(0);

  return (
    <img
      {...props}
      loading="lazy"
      decoding="async"
      src={failed ? ERROR_PLACEHOLDER : props.src}
      onLoad={() => {
        setLoaded(true);
        retryCountRef.current = 0;
      }}
      onError={() => {
        if (retryCountRef.current === 0 && typeof props.src === "string") {
          retryCountRef.current += 1;
          // 换一个带时间戳的 URL 强制绕过缓存重试
          const nextSrc = `${props.src}${props.src.includes("?") ? "&" : "?"}retry=1`;
          (document.querySelector(`img[src="${props.src}"]`) as HTMLImageElement | null)?.setAttribute("src", nextSrc);
          return;
        }
        setFailed(true);
        setLoaded(true);
      }}
      onClick={failed ? () => {
        retryCountRef.current = 0;
        setFailed(false);
        setLoaded(false);
      } : props.onClick}
      title={failed ? "点击重新加载图片" : props.title}
      className={cn(
        // 加载中：透明 + 浅灰底；完成后 300ms 淡入并移除灰底
        "transition-opacity duration-300",
        loaded ? "opacity-100" : "opacity-0 bg-slate-100/70",
        failed && "cursor-pointer",
        props.className,
      )}
    />
  );
}
