"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";

import type { ImageSize, LingyaModel } from "@/lib/api/lingya";
import type { ResolutionOption } from "@/components/studio/ResolutionSelector";

/**
 * Studio 图像模型选项的单一事实来源。
 * 此前 8 个页面各自维护 MODELS 数组 + 预翻译 map；这里统一为：
 * 策展元数据（根相对翻译键 Shared.modelDesc.max4k / Shared.modelBadge.*）
 * 全量展示，可见性由 StudioModelSelector 的服务端 /api/model-catalog 过滤。
 *
 * 注意：不要从用户持久化的 config.imageModels 推导列表——老用户本地
 * 存储的 channels/imageModels 可能缺少后来发布的模型（曾导致工作台
 * 只剩 gpt-image-2）。新增/下架模型 = 更新本表 + 后台 catalog 开关。
 */
export const STUDIO_IMAGE_MODEL_META: Record<
  LingyaModel,
  { label: string; englishLabel: string; descKey: string; badgeKey: string; icon: string }
> = {
  "gpt-image-2": {
    label: "GPT Image 2",
    englishLabel: "GPT Image 2",
    descKey: "Shared.modelDesc.fineDetail",
    badgeKey: "Shared.modelBadge.latest",
    icon: "/model-covers/gpt-image-2.png",
  },
  "nano-banana-2": {
    label: "香蕉2",
    englishLabel: "Nano Banana 2",
    descKey: "Shared.modelDesc.fastGeneral",
    badgeKey: "Shared.modelBadge.recommended",
    icon: "/model-covers/banana-2.png",
  },
  "nano-banana-pro": {
    label: "香蕉Pro",
    englishLabel: "Nano Banana Pro",
    descKey: "Shared.modelDesc.commercialRetouch",
    badgeKey: "Shared.modelBadge.highQuality",
    icon: "/model-covers/banana-pro.png",
  },
};

const ALL_CURATED_MODELS = Object.keys(STUDIO_IMAGE_MODEL_META) as LingyaModel[];

/**
 * 清晰度选项（1K/2K/4K）的统一分层，供 ResolutionSelector 直接消费：
 * - 标签只传 "1K"/"2K"/"4K"，组件统一组合本地化的标清/高清/超清
 * - 价格 / 单件积分保留在无障碍描述，并在 RunBar summary 中展示
 * - 2K 的「推荐」角标由 ResolutionSelector 统一渲染
 */
export function useResolutionOptions(
  sizes: ImageSize[],
  getCost: (size: ImageSize) => number,
  creditsUnit: string
): ResolutionOption<ImageSize>[] {
  const tRoot = useTranslations();
  return useMemo(
    () =>
      sizes.map((size) => {
        const tierKey =
          size === "1K"
            ? "Shared.resolutionStandard"
            : size === "2K"
              ? "Shared.resolutionHD"
              : "Shared.resolutionUltra";
        return {
          value: size,
          label: size,
          description: `${tRoot(tierKey)} · ${getCost(size)}${creditsUnit}`,
        };
      }),
    [sizes, getCost, creditsUnit, tRoot],
  );
}

/**
 * 旧版 StudioOptionGrid 兼容导出（保留以防旧调用方残留，description 含单价）。
 * 新代码请直接使用 ResolutionSelector + useResolutionOptions。
 *
 * @deprecated use ResolutionSelector + useResolutionOptions
 */
export function useImageSizeOptions(
  sizes: ImageSize[],
  getCost: (size: ImageSize) => number,
  creditsUnit: string,
) {
  const tRoot = useTranslations();
  return useMemo(
    () =>
      sizes.map((size) => {
        const tierKey =
          size === "1K"
            ? "Shared.resolutionStandard"
            : size === "2K"
              ? "Shared.resolutionHD"
              : "Shared.resolutionUltra";
        return {
          value: size,
          label: size,
          description: `${tRoot(tierKey)} · ${getCost(size)}${creditsUnit}`,
          badge: size === "2K" ? tRoot("Shared.modelBadge.recommended") : undefined,
        };
      }),
    [sizes, getCost, creditsUnit, tRoot],
  );
}

export function useStudioImageModelOptions() {
  const tRoot = useTranslations();
  const locale = useLocale();
  const isChinese = locale.toLowerCase().startsWith("zh");

  return useMemo(
    () =>
      ALL_CURATED_MODELS.map((value) => {
        const meta = STUDIO_IMAGE_MODEL_META[value];
        const compactBadge = value === "gpt-image-2"
          ? "NEW"
          : value === "nano-banana-2"
            ? "REC"
            : "PRO";
        return {
          value,
          label: isChinese ? meta.label : meta.englishLabel,
          desc: tRoot(meta.descKey),
          badge: isChinese ? tRoot(meta.badgeKey) : compactBadge,
          icon: meta.icon,
        };
      }),
    [isChinese, tRoot],
  );
}
