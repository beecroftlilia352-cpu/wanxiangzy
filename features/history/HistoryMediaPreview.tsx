"use client";

import type { CSSProperties } from "react";
import { Play } from "lucide-react";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";
import { getImageVariantUrl } from "@/lib/image-variants";
import { isLikelyVideoUrl } from "@/lib/media";

type Props = {
  url: string;
  variant: "card" | "thumb" | "preview";
  className?: string;
  alt: string;
  style?: CSSProperties;
  controls?: boolean;
};

/**
 * 历史卡片/详情面板中统一的图片/视频预览。
 *
 * - 自动识别视频 URL（通过扩展名或 ?type=video 标记）渲染带播放图标的 <video>。
 * - 图片走 getImageVariantUrl 拿到对应 variant 的 CDN 参数。
 * - 列表卡（card / thumb）默认 object-cover，详情大图（preview）默认 object-contain。
 */
export function HistoryMediaPreview({
  url,
  variant,
  className = "",
  alt,
  style,
  controls = false,
}: Props) {
  const isVideo = isLikelyVideoUrl(url);
  const mediaClass = `${variant === "preview" ? "max-h-full max-w-full object-contain" : "h-full w-full object-cover"} ${className}`.trim();

  if (isVideo) {
    return (
      <span
        className={`relative block overflow-hidden bg-black ${
          variant === "preview" ? "max-h-full max-w-full" : "h-full w-full"
        }`}
      >
        <video
          src={url}
          className={mediaClass}
          style={style}
          controls={controls}
          muted={!controls}
          playsInline
          preload="metadata"
          onClick={(event) => {
            if (controls) event.stopPropagation();
          }}
        />
        {!controls && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10 text-white">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/58 shadow-sm backdrop-blur">
              <Play className="h-3.5 w-3.5 fill-current" />
            </span>
          </span>
        )}
      </span>
    );
  }

  return (
    <RawPreviewImage
      src={getImageVariantUrl(url, variant)}
      className={mediaClass}
      style={style}
      alt={alt}
    />
  );
}