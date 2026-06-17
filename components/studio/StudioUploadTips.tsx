"use client";

import type { CSSProperties, ReactNode } from "react";

export type StudioUploadTip = {
  label: string;
  text: string;
};

type BuildStudioUploadTipsOptions = {
  title?: string;
  description?: string;
  footnote?: string;
  imageRequirement?: string;
};

type TipPreset = {
  info: string;
  requirement: string;
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
    return {
      info: "参考图只锁定动作和构图。",
      requirement: "肢体完整、动作清楚、单人同框。",
    };
  }

  if (/换脸|脸|面部|正脸|五官/.test(source)) {
    return {
      info: "用于保持脸型和五官气质。",
      requirement: "正脸清晰、无遮挡、光线均匀。",
    };
  }

  if (/服装|上装|下装|连体|衣服|款式|商品|穿搭/.test(source)) {
    return {
      info: "款式越干净，上身越稳定。",
      requirement: "主体完整、边缘清楚、无遮挡。",
    };
  }

  if (/背景|场景|空间/.test(source)) {
    return {
      info: "用于锁定场景氛围和光线。",
      requirement: "空间完整、光线方向明确。",
    };
  }

  if (/模特|人物|人像|写真/.test(source)) {
    return {
      info: "多张同身份图更稳。",
      requirement: "五官清晰、光线稳定。",
    };
  }

  return {
    info: "上传越清晰，生成越稳定。",
    requirement: "主体清晰、构图完整。",
  };
}

export function buildStudioUploadTips({
  title,
  description,
  footnote,
  imageRequirement,
}: BuildStudioUploadTipsOptions) {
  const preset = inferTipPreset({ title, description, footnote });
  const requirement = normalizeTipText(imageRequirement) || preset.requirement;

  return [
    { label: "说明", text: preset.info },
    { label: "图片要求", text: requirement.replace(/^图片要求[:：]\s*/, "") },
  ];
}

export function StudioUploadTips({ tips, action }: StudioUploadTipsProps) {
  const visibleTips = tips
    .filter((tip) => normalizeTipText(tip.text))
    .slice(0, 2)
    .map((tip) => ({ ...tip, text: shortenTipText(tip.text) }));

  if (!visibleTips.length) return null;

  return (
    <div className="studio-upload-tile-tips" data-tip-count={visibleTips.length} aria-label="上传提示">
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
