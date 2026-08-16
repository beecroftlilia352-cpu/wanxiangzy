"use client";

import { useCallback, useRef, useState } from "react";
import type { ImgHTMLAttributes } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

type RawPreviewImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "alt"> & {
  alt: string;
  /** 首屏小图（示例图等）用 eager，避免懒加载判定失败导致白图 */
  eager?: boolean;
  /** Static UI artwork can opt out of the loading fade to avoid flashing on remount. */
  disableFade?: boolean;
};

// 图片加载失败的优雅占位：浅灰底 + 细线"图片"图标，替代浏览器默认裂图
const ERROR_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Crect width='400' height='400' fill='%23eef1f6'/%3E%3Cg fill='none' stroke='%23b3bcc9' stroke-width='9' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='96' y='116' width='208' height='168' rx='14'/%3E%3Ccircle cx='156' cy='172' r='20'/%3E%3Cpath d='M112 262l56-54 44 40 36-32 44 46'/%3E%3C/g%3E%3C/svg%3E";

const MAX_RETRIES = 1;

export function RawPreviewImage({ eager = false, disableFade = false, ...props }: RawPreviewImageProps) {
  // Studio previews can be blob/data URLs or user/provider URLs that should not go through Next image optimization.
  // Default to lazy + async decoding (below-fold previews); callers can override via {...props}.
  const t = useTranslations("Shared");
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  // 重试时用 state 驱动 src（带时间戳绕过缓存），不要直接 setAttribute 绕过 React
  const [src, setSrc] = useState<string | undefined>(typeof props.src === "string" ? props.src : undefined);
  const retryCountRef = useRef(0);

  // 关键修复：SSR 后浏览器可能用缓存立即完成加载，onLoad 事件发生在 React
  // 附加 handler 之前而永远丢失 —— 导致图片一直 opacity-0（用户看到的白图）。
  // 挂载时检查 img.complete 补救。
  const imgRef = useCallback((node: HTMLImageElement | null) => {
    if (node && node.complete && node.naturalWidth > 0) {
      setLoaded(true);
    }
  }, []);

  return (
    <img
      {...props}
      ref={imgRef}
      loading={eager ? "eager" : "lazy"}
      decoding={eager ? "sync" : "async"}
      src={failed ? ERROR_PLACEHOLDER : src}
      onLoad={() => {
        setLoaded(true);
        retryCountRef.current = 0;
      }}
      onError={() => {
        if (retryCountRef.current < MAX_RETRIES && typeof src === "string") {
          retryCountRef.current += 1;
          const separator = src.includes("?") ? "&" : "?";
          setSrc(`${src}${separator}retry=${retryCountRef.current}`);
          return;
        }
        setFailed(true);
        setLoaded(true);
      }}
      onClick={failed ? () => {
        retryCountRef.current = 0;
        setFailed(false);
        setLoaded(false);
        setSrc(typeof props.src === "string" ? props.src : undefined);
      } : props.onClick}
      title={failed ? t("reloadImage") : props.title}
      className={cn(
        // 加载中：透明 + 浅灰底；完成后 300ms 淡入并移除灰底
        disableFade ? "opacity-100 transition-none" : "transition-opacity duration-300",
        !disableFade && (loaded ? "opacity-100" : "opacity-0 bg-[var(--codex-surface-soft)]/70"),
        failed && "cursor-pointer",
        props.className,
      )}
    />
  );
}
