import Image from "next/image";
import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";

export type ImageTranslationHeroProps = {
  /**
   * 主图源。默认使用本地 banner，未来可改用 OSS CDN。
   */
  imageSrc?: string;
  mobileImageSrc?: string;
  title?: ReactNode;
  description?: ReactNode;
  /** 右下角可选 action 区（例如 "试一试" 按钮） */
  actions?: ReactNode;
};

const DEFAULT_IMAGE_SRC = "/image-translation/hero-banner.png";
const DEFAULT_MOBILE_IMAGE_SRC = "/image-translation/hero-banner-mobile.png";

export function ImageTranslationHero({
  imageSrc = DEFAULT_IMAGE_SRC,
  mobileImageSrc = DEFAULT_MOBILE_IMAGE_SRC,
  title,
  description,
  actions,
}: ImageTranslationHeroProps) {
  return (
    <div className="relative mx-auto w-full max-w-[1180px] px-2 py-2 sm:px-4">
      <div className="pointer-events-none absolute inset-x-12 top-10 h-40 rounded-full bg-[radial-gradient(circle,rgba(91,124,255,0.18),transparent_70%)] blur-3xl" />
      <div className="pointer-events-none absolute inset-x-12 top-40 h-40 rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.16),transparent_72%)] blur-3xl" />
      <div className="relative">
        {title || description ? (
          <div className="mb-4 text-center sm:mb-6">
            {title ? (
              <h3 className="text-[22px] font-black tracking-normal text-slate-950 dark:text-stone-100 sm:text-[30px]" style={{ textWrap: "balance" }}>
                {title}
              </h3>
            ) : null}
            {description ? (
              <p className="mx-auto mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-500 dark:text-stone-400 sm:text-[15px]">
                {description}
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="relative overflow-hidden rounded-[28px] border border-white/80 bg-white/90 shadow-[0_28px_90px_rgba(91,124,255,0.18),0_8px_26px_rgba(15,23,42,0.08)] ring-1 ring-slate-950/[0.04] backdrop-blur dark:border-white/10 dark:bg-white/5 dark:ring-white/5">
          <div className="relative aspect-[16/9] w-full">
            <picture>
              <source media="(max-width: 640px)" srcSet={mobileImageSrc} />
              <Image
                src={imageSrc}
                alt="图片翻译功能示意：智能识图翻译，支持 180+ 国家及地区语言"
                fill
                priority
                sizes="(max-width: 640px) 92vw, (max-width: 1180px) 92vw, 1180px"
                className="object-cover"
              />
            </picture>
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/5 via-transparent to-transparent" />
          </div>
          {actions ? (
            <div className="flex flex-wrap items-center justify-center gap-2 border-t border-slate-100/80 bg-white/70 px-4 py-3 text-[12px] font-semibold text-slate-500 backdrop-blur dark:border-white/10 dark:bg-stone-900/40 dark:text-stone-300 sm:gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(91,124,255,0.1)] px-2.5 py-1 text-violet-700 dark:bg-[rgba(91,124,255,0.1)]0/15 dark:text-violet-200">
                <Sparkles className="h-3 w-3" />
                一键多语言本地化
              </span>
              {actions}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
