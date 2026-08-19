"use client";

import { useTranslations } from "next-intl";
import { getImageVariantUrl } from "@/lib/image-variants";
import type { MutableRefObject } from "react";
import { Camera, CheckCircle2, FolderOpen, UserRound } from "lucide-react";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";
import { MODEL_HAIR_STYLES, type HairStyleOption } from "@/lib/model-presets";

type Gender = "female" | "male";

type Props = {
  gender: Gender;
  hairStyle: string | null;
  hairReferenceUrl: string | null;
  hairInputRef: MutableRefObject<HTMLInputElement | null>;
  onSelectPreset: (value: string) => void;
  onClear: () => void;
  onUpload: (files: File[]) => Promise<unknown> | void;
  onRemoveUpload: () => void;
  onPickFile: () => void;
  onPickLibrary?: () => void;
};

/**
 * 发型选择面板：默认 / 预设发型 / 上传发型参考图。
 *
 * 受控组件：所有状态由父组件持有并通过回调传出。Ref 透传给隐藏的 <input>，
 * 父组件负责真实的上传逻辑（涉及 supabase + credits）。
 */
export function HairStyleSection({ gender, hairStyle, hairReferenceUrl, hairInputRef, onSelectPreset, onClear, onUpload, onRemoveUpload, onPickFile, onPickLibrary }: Props) {
  const t = useTranslations("Model");
  const presets: HairStyleOption[] = MODEL_HAIR_STYLES[gender];

  return (
    <section>
      <h3 className="studio-control-title mb-3">{t("hairStyleRef")}</h3>
      <input
        ref={hairInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const input = event.currentTarget;
          const files = Array.from(input.files || []);
          const result = onUpload(files);
          if (result && typeof (result as Promise<unknown>).finally === "function") {
            (result as Promise<unknown>).finally(() => {
              input.value = "";
            });
          } else {
            input.value = "";
          }
        }}
      />
      <div className="grid grid-cols-4 gap-2">
        <button
          onClick={onClear}
          className={`rounded-lg border p-2 text-center transition-colors aspect-[3/4] flex flex-col items-center justify-center ${
            !hairStyle && !hairReferenceUrl ? "border-[var(--codex-accent)] bg-[var(--codex-accent-08)] text-[var(--codex-accent)] ring-1 ring-[var(--codex-accent-25)] dark:bg-[var(--codex-accent-14)] dark:text-[var(--codex-accent)] dark:ring-[var(--codex-accent-38)]" : "border-[var(--codex-border)] dark:border-white/10 bg-codex-surface dark:bg-[#26262a] text-codex-faint dark:text-codex-faint hover:border-[var(--codex-border-strong)] dark:hover:border-white/20"
          }`}
        >
          <UserRound className="w-5 h-5 mb-1" />
          <span className="text-[11px] font-medium">{t("noDefault")}</span>
        </button>
        {presets.map((item) => (
          <button key={item.value} onClick={() => onSelectPreset(item.value)}
            className={`rounded-lg overflow-hidden border text-left transition-colors ${
              hairStyle === item.value && !hairReferenceUrl ? "border-[var(--codex-accent)] ring-1 ring-[var(--codex-accent-25)]" : "border-[var(--codex-border)] dark:border-white/10 hover:border-[var(--codex-border-strong)] dark:hover:border-white/20 bg-codex-surface dark:bg-[#26262a] text-codex-ink dark:text-codex-muted"
            }`}>
            <RawPreviewImage src={item.image} alt={item.labelKey ? t(item.labelKey) : item.label} className="w-full aspect-[3/4] object-cover bg-[var(--codex-surface-soft)] dark:bg-white/4" />
            <div className="px-1 py-1 text-[11px] text-center font-medium">{item.labelKey ? t(item.labelKey) : item.label}</div>
          </button>
        ))}
        <button
          onClick={onPickFile}
          className={`relative rounded-lg border-2 border-dashed p-2 text-center transition-[background-color,border-color,box-shadow,color] aspect-[3/4] flex flex-col items-center justify-center overflow-hidden ${
            hairReferenceUrl
              ? "studio-checkerboard border-[var(--codex-accent)] text-[var(--codex-accent)] ring-2 ring-[var(--codex-accent-25)] shadow-[0_14px_34px_var(--codex-accent-18)]"
              : "border-[var(--codex-border)] dark:border-white/10 bg-[var(--codex-surface-soft)]/70 dark:bg-white/4 text-codex-faint dark:text-codex-faint hover:border-[var(--codex-accent-35)] hover:bg-[var(--codex-accent-08)] hover:text-[var(--codex-accent)]"
          }`}
        >
          {hairReferenceUrl ? (
            <>
              <RawPreviewImage src={getImageVariantUrl(hairReferenceUrl, "card")} className="absolute inset-0 h-full w-full object-contain p-1" alt={t("uploadedHairRef")} />
              <span className="absolute inset-0 bg-gradient-to-t from-codex-ink/38 via-transparent to-transparent" />
              <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white dark:bg-white/5 text-emerald-500 shadow">
                <CheckCircle2 className="h-4 w-4" />
              </span>
              <span className="absolute bottom-0 left-0 right-0 bg-white/94 dark:bg-white/5 px-1.5 py-1 text-center backdrop-blur">
                <span className="block text-[11px] font-bold text-[var(--codex-accent)]">{t("uploadedHairRef")}</span>
                <span className="block truncate text-[12px] text-codex-faint">{t("hairOutlineOnly")}</span>
              </span>
            </>
          ) : (
            <>
              <Camera className="w-5 h-5 mb-1.5" />
              <span className="text-[11px] font-bold">{t("uploadHairRef")}</span>
              <span className="mt-1 max-w-[78px] text-[12px] leading-snug text-codex-faint">
                {t("hairOnlyNoFace")}
              </span>
              <span className="mt-1 text-[11px] text-codex-faint">≤15MB</span>
            </>
          )}
        </button>
      </div>
      {onPickLibrary ? (
        <button
          type="button"
          onClick={onPickLibrary}
          className="mt-2 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-[var(--codex-border)] bg-white/80 text-xs font-semibold text-codex-muted transition hover:border-[var(--codex-accent-35)] hover:bg-[var(--codex-accent-08)] hover:text-[var(--codex-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--codex-accent-35)]"
        >
          <FolderOpen className="h-4 w-4" aria-hidden="true" />
          {t("uploadLibrary")}
        </button>
      ) : null}
      {hairReferenceUrl && (
        <button
          onClick={onRemoveUpload}
          className="mt-2 text-xs text-codex-faint hover:text-red-500"
        >
          {t("removeHairRef")}
        </button>
      )}
    </section>
  );
}
