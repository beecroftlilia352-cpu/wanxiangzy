"use client";

import type { CSSProperties, ReactNode } from "react";
import { useTranslations } from "next-intl";

export type StudioUploadTip = {
  /** 渲染兜底文案；携带 labelKey 时由渲染端按 Shared 命名空间翻译 */
  label?: string;
  text?: string;
  /** 当 tips 由 buildStudioUploadTips 生成时携带，用于渲染端按 Shared 命名空间翻译 */
  labelKey?: string;
  textKey?: string;
};

type BuildStudioUploadTipsOptions = {
  title?: string;
  description?: string;
  footnote?: string;
  imageRequirement?: string;
};

type TipPreset = {
  infoKey: string;
  requirementKey: string;
};

type StudioUploadTipsProps = {
  tips: StudioUploadTip[];
  action?: ReactNode;
};

function normalizeTipText(text?: string) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function shortenTipText(text: string, max = 28) {
  const normalized = normalizeTipText(text);
  if (normalized.length <= max) return normalized;
  const segment = normalized.split(/[。；;.!?？]/)[0]?.trim();
  if (segment && segment.length <= max) return segment;
  return `${normalized.slice(0, max - 1)}…`;
}

function inferTipPreset({ title, description, footnote }: BuildStudioUploadTipsOptions): TipPreset {
  const source = `${title || ""} ${description || ""} ${footnote || ""}`;

  if (/姿势|动作|参考/.test(source)) {
    return { infoKey: "infoOnlyPose", requirementKey: "reqPose" };
  }

  if (/换脸|脸|面部|正脸|五官/.test(source)) {
    return { infoKey: "infoFace", requirementKey: "reqFace" };
  }

  if (/服装|上装|下装|连体|衣服|款式|商品|穿搭/.test(source)) {
    return { infoKey: "infoClothing", requirementKey: "reqClothing" };
  }

  if (/背景|场景|空间/.test(source)) {
    return { infoKey: "infoScene", requirementKey: "reqScene" };
  }

  if (/模特|人物|人像|写真/.test(source)) {
    return { infoKey: "infoModel", requirementKey: "reqModel" };
  }

  return { infoKey: "infoDefault", requirementKey: "reqDefault" };
}

export function buildStudioUploadTips({
  title,
  description,
  footnote,
  imageRequirement,
}: BuildStudioUploadTipsOptions): StudioUploadTip[] {
  const preset = inferTipPreset({ title, description, footnote });
  const requirement = normalizeTipText(imageRequirement);

  return [
    { labelKey: "tipInfo", textKey: preset.infoKey },
    {
      labelKey: "tipRequirement",
      textKey: requirement ? undefined : preset.requirementKey,
      text: requirement.replace(/^图片要求[:：]\s*/, ""),
    },
  ];
}

export function StudioUploadTips({ tips, action }: StudioUploadTipsProps) {
  const t = useTranslations("Shared");
  const visibleTips = tips
    .map((tip) => ({
      ...tip,
      label: tip.labelKey ? t(tip.labelKey) : tip.label || "",
      text: tip.textKey ? t(tip.textKey) : tip.text || "",
    }))
    .filter((tip) => normalizeTipText(tip.text))
    .slice(0, 2)
    .map((tip) => ({ ...tip, text: shortenTipText(tip.text || "") }));

  if (!visibleTips.length) return null;

  return (
    <div className="studio-upload-tile-tips" data-tip-count={visibleTips.length} aria-label={t("uploadTips")}>
      <span className="studio-upload-tile-tips-label">Tips.</span>
      <div className="studio-upload-tile-tips-viewport">
        <div
          className="studio-upload-tile-tips-track"
          style={{ "--studio-upload-tip-count": visibleTips.length } as CSSProperties}
        >
          {visibleTips.map((tip) => (
            <span className="studio-upload-tile-tips-item" key={`${tip.label}-${tip.text}`} title={`${tip.label}：${tip.text}`}>
              <strong>{tip.label}</strong>
              <span>{tip.text}</span>
            </span>
          ))}
        </div>
      </div>
      {action && <span className="studio-upload-tile-tips-action">{action}</span>}
    </div>
  );
}
