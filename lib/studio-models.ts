"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { modelOptionName, selectableModelsByCapability, useConfigStore } from "@/stores/use-config-store";
import type { LingyaModel } from "@/lib/api/lingya";

/**
 * Studio 图像模型选项的单一事实来源。
 * 此前 8 个页面各自维护 MODELS 数组 + 预翻译 map，descKey/badgeKey 的
 * 相对/绝对路径约定已漂移（Pose.models.* vs Shared.modelBadge.* 两套并存）。
 * 这里统一：策展元数据 + channel 配置推导可选列表 + 根相对翻译键
 * （Shared.modelDesc.max4k / Shared.modelBadge.*），返回已翻译的
 * StudioModelSelector 选项；可见性仍由服务端 /api/model-catalog 过滤。
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
  const config = useConfigStore((state) => state.config);

  return useMemo(() => {
    const known = selectableModelsByCapability(config, "image")
      .map(modelOptionName)
      .filter((name): name is LingyaModel => Object.hasOwn(STUDIO_IMAGE_MODEL_META, name));
    const values = ALL_CURATED_MODELS.filter((name) => known.includes(name));
    return (values.length ? values : ALL_CURATED_MODELS).map((value) => {
      const meta = STUDIO_IMAGE_MODEL_META[value];
      return {
        value,
        label: meta.label,
        desc: tRoot(meta.descKey),
        badge: tRoot(meta.badgeKey),
        icon: meta.icon,
      };
    });
  }, [config, tRoot]);
}
