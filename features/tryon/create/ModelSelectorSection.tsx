"use client";

import { useTranslations } from "next-intl";
import { Cpu } from "lucide-react";
import { StudioModelSelector } from "@/components/studio/StudioFormControls";
import type { AspectRatio, ImageSize, LingyaModel } from "@/lib/api/lingya";
import { isNanoBananaModel, getCreditCost } from "@/lib/api/lingya";

type ModelCost = {
  value: LingyaModel;
  label: string;
  desc: string;
  icon?: string;
};

type Props = {
  models: readonly ModelCost[];
  value: LingyaModel;
  imageSize: ImageSize;
  aspectRatio: AspectRatio;
  hasModelFace: boolean;
  onChange: (value: LingyaModel) => void;
};

/**
 * 生成模型选择面板：图标 + StudioModelSelector + 选 face 模式时的香蕉警告。
 *
 * 受控组件：父组件持有 LingyaModel 状态；onChange 时父组件决定是否 toast
 * （传入 onChange 闭包里）。成本 meta / face-fusion 警告由组件内部根据
 * hasModelFace 计算，避免每次渲染都重算。
 */
export function ModelSelectorSection({ models, value, imageSize, aspectRatio, hasModelFace, onChange }: Props) {
  const t = useTranslations("Create");

  return (
    <section>
      <h3 className="font-bold text-sm mb-3 flex items-center gap-2 text-codex-ink">
        <Cpu className="w-4 h-4 text-[var(--codex-accent)]" /> {t("model.sectionTitle")}
      </h3>
      <StudioModelSelector
        models={models}
        value={value}
        onChange={onChange}
        ariaLabel={t("model.sectionTitle")}
        getMeta={(model) => (
          hasModelFace && isNanoBananaModel(model.value)
            ? t("model.faceFusionWarning")
            : t("model.costMeta", { desc: model.desc, cost: getCreditCost(model.value, imageSize, aspectRatio) })
        )}
      />
      {hasModelFace && (
        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-5 text-amber-800">
          {t("model.bananaWarning")}
          <a href="/face-swap" className="mx-1 font-bold text-amber-900 underline decoration-amber-400 underline-offset-2">{t("model.swapModule")}</a>
          {t("model.swapFace")}
        </div>
      )}
    </section>
  );
}