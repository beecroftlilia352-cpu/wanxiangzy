"use client";

import { useTranslations } from "next-intl";
import { Loader2, Wand } from "lucide-react";
import { StudioPromptTextarea } from "@/components/studio/StudioFormControls";
import { STYLE_PRESETS } from "@/lib/tryon-studio-options";

type Props = {
  customStyle: string;
  optimizing: boolean;
  onChangeStyle: (value: string) => void;
  onOptimize: () => void;
};

/**
 * 提示词输入 + 风格预设 + 智能优化按钮。
 *
 * 受控组件：customStyle 由调用方持有；onChangeStyle 在用户键入或点预设时调用；
 * onOptimize 触发智能优化（按钮 disable 逻辑由调用方决定，避免父组件被传 ref）。
 */
export function PromptStyleSection({ customStyle, optimizing, onChangeStyle, onOptimize }: Props) {
  const t = useTranslations("Create");

  return (
    <section>
      <StudioPromptTextarea
        title={t("prompt.title")}
        badge={t("common.optional")}
        value={customStyle}
        onChange={(e) => onChangeStyle(e.target.value)}
        placeholder={t("prompt.placeholder")}
        aria-label={t("prompt.title")}
        rows={4}
        action={(
          <button
            type="button"
            onClick={onOptimize}
            disabled={optimizing || !customStyle.trim()}
            className="studio-prompt-icon-action"
            title={t("prompt.optimizeTitle")}
          >
            {optimizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand className="w-3.5 h-3.5" />}
          </button>
        )}
      />
      <div className="flex flex-wrap gap-1.5 mt-2">
        {STYLE_PRESETS.map((s, i) => (
          <button
            key={i}
            onClick={() => onChangeStyle(s)}
            aria-pressed={customStyle === s}
            className="rounded-full border bg-[var(--codex-surface-soft)] px-2 py-0.5 text-[11px] text-codex-muted transition-colors hover:bg-[var(--codex-accent-08)] hover:text-[var(--codex-accent)] dark:border-white/10 dark:bg-white/5 dark:text-codex-faint dark:hover:bg-[var(--codex-accent-14)] dark:hover:text-[var(--codex-accent)]"
          >
            {t(`stylePreset.${i}`)}
          </button>
        ))}
      </div>
    </section>
  );
}