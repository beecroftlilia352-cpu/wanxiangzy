"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";

import type { LingyaModel } from "@/lib/api/lingya";

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
  { label: string; descKey: string; badgeKey: string; icon: string }
> = {
  "nano-banana-2": {
    label: "Nano-Banana-2",
    descKey: "Shared.modelDesc.max4k",
    badgeKey: "Shared.modelBadge.recommended",
    icon: "/model-icons/gemini.png",
  },
  "gpt-image-2": {
    label: "GPT-Image-2",
    descKey: "Shared.modelDesc.max4k",
    badgeKey: "Shared.modelBadge.latest",
    icon: "/model-icons/openai.svg",
  },
  "nano-banana-pro": {
    label: "Nano-Banana-Pro",
    descKey: "Shared.modelDesc.max4k",
    badgeKey: "Shared.modelBadge.highQuality",
    icon: "/model-icons/gemini.png",
  },
};

const ALL_CURATED_MODELS = Object.keys(STUDIO_IMAGE_MODEL_META) as LingyaModel[];

export function useStudioImageModelOptions() {
  const tRoot = useTranslations();

  return useMemo(
    () =>
      ALL_CURATED_MODELS.map((value) => {
        const meta = STUDIO_IMAGE_MODEL_META[value];
        return {
          value,
          label: meta.label,
          desc: tRoot(meta.descKey),
          badge: tRoot(meta.badgeKey),
          icon: meta.icon,
        };
      }),
    [tRoot],
  );
}
