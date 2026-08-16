"use client";

import { useTranslations } from "next-intl";
import { StudioModelSelector } from "@/components/studio/StudioFormControls";
import type { LingyaModel } from "@/lib/api/lingya";
import { isNanoBananaModel } from "@/lib/api/lingya";

type ModelCost = {
  value: LingyaModel;
  label: string;
  desc: string;
  icon?: string;
};

type Props = {
  models: readonly ModelCost[];
  value: LingyaModel;
  hasModelFace: boolean;
  onChange: (value: LingyaModel) => void;
};

/**
 * 生成模型选择面板：图标 + StudioModelSelector + 选 face 模式时的香蕉警告。
 *
 * 受控组件：父组件持有 LingyaModel 状态；onChange 时父组件决定是否 toast
 * （传入 onChange 闭包里）。face-fusion 警告由组件内部根据 hasModelFace
 * 计算；普通状态保持模型目录中的统一描述。
 */
export function ModelSelectorSection({ models, value, hasModelFace, onChange }: Props) {
  const t = useTranslations("Create");

  return (
    <div>
      <StudioModelSelector
        models={models}
        value={value}
        onChange={onChange}
        ariaLabel={t("model.sectionTitle")}
        getMeta={(model) => (
          hasModelFace && isNanoBananaModel(model.value)
            ? t("model.faceFusionWarning")
            : null
        )}
      />
      {hasModelFace && (
        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-5 text-amber-800">
          {t("model.bananaWarning")}
          <a href="/face-swap" className="mx-1 font-bold text-amber-900 underline decoration-amber-400 underline-offset-2">{t("model.swapModule")}</a>
          {t("model.swapFace")}
        </div>
      )}
    </div>
  );
}
