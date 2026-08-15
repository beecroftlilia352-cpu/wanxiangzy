"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, ChevronsDown, ImagePlus, Loader2, Plus, Settings2, Sparkles, Trash2, WandSparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";
import { useStableFileDrag } from "@/components/studio/useStableFileDrag";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import {
  DEFAULT_OUTFIT_FUSION_CONFIG,
  OUTFIT_FUSION_MODELS,
  type OutfitFusionAsset,
  type OutfitFusionAssetRole,
  type OutfitFusionConfig,
} from "@/lib/outfit-fusion";
import type { ImageSize } from "@/lib/api/lingya";

const EMPTY_SLOTS: Array<{ role: OutfitFusionAssetRole; labelKey: string; optional?: boolean }> = [
  { role: "outfit", labelKey: "roles.outfit" },
  { role: "reference", labelKey: "roles.reference", optional: true },
  { role: "model", labelKey: "roles.model", optional: true },
];

const IMAGE_SIZES: ImageSize[] = ["1K", "2K", "4K"];
const MENTION_QUERY_PATTERN = /@([\u4e00-\u9fa5A-Za-z0-9_-]{0,20})$/;
const COMPOSER_MOTION = {
  type: "spring",
  stiffness: 520,
  damping: 44,
  mass: 0.72,
} as const;

export type OutfitFusionComposerProps = {
  assets: OutfitFusionAsset[];
  prompt: string;
  config: OutfitFusionConfig;
  collapsed?: boolean;
  generating?: boolean;
  autoWriting?: boolean;
  uploading?: boolean;
  creditCost?: number;
  credits?: number | null;
  authIsAnonymous?: boolean;
  className?: string;
  onPromptChange: (value: string) => void;
  onConfigChange: (config: OutfitFusionConfig) => void;
  onUploadClick: (role: OutfitFusionAssetRole) => void;
  onUploadFiles: (role: OutfitFusionAssetRole, files: File[]) => void;
  onPreviewAsset?: (id: string) => void;
  onRemoveAsset: (id: string) => void;
  onClear: () => void;
  onAutoWrite: () => void | Promise<void>;
  onGenerate: () => void;
  onCollapse: () => void;
  onExpand: () => void;
  onJumpToBottom: () => void;
};

export function OutfitFusionComposer({
  assets,
  prompt,
  config,
  collapsed = false,
  generating = false,
  autoWriting = false,
  uploading = false,
  creditCost = 0,
  credits = null,
  authIsAnonymous = false,
  className,
  onPromptChange,
  onConfigChange,
  onUploadClick,
  onUploadFiles,
  onPreviewAsset,
  onRemoveAsset,
  onClear,
  onAutoWrite,
  onGenerate,
  onCollapse,
  onExpand,
  onJumpToBottom,
}: OutfitFusionComposerProps) {
  const t = useTranslations("OutfitFusion");
  const canGenerate = assets.length > 0 && prompt.trim().length > 0 && !generating && !uploading && !autoWriting;
  const modelLabel = OUTFIT_FUSION_MODELS.find((item) => item.value === config.aiModel)?.label || config.aiModel;
  const visibleSlots = EMPTY_SLOTS.filter((slot) => {
    if (slot.role === "outfit") return true;
    return !assets.some((asset) => asset.role === slot.role);
  });
  const compactPrompt = assets.length === 0 && prompt.trim().length === 0;
  const primaryLabel = authIsAnonymous ? t("loginToGenerate") : generating ? t("creating") : t("generateCount", { count: config.genCount });
  const costLabel = authIsAnonymous ? t("loginToViewCredits") : t("costCredits", { count: creditCost });
  const balanceLabel = authIsAnonymous ? "" : t("balanceCredits", { count: credits ?? "-" });

  return (
    <AnimatePresence mode="wait" initial={false}>
      {collapsed ? (
        <motion.div
          key="compact"
          initial={{ opacity: 0, y: 26, scale: 0.985, filter: "blur(5px)" }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: 18, scale: 0.985, filter: "blur(4px)" }}
          transition={COMPOSER_MOTION}
          style={{ transformOrigin: "bottom center" }}
          className={cn("pointer-events-auto mx-auto w-full max-w-[760px] will-change-[transform,opacity,filter] motion-reduce:transform-none", className)}
        >
          <div className="flex min-h-[64px] items-center gap-3 rounded-[8px] bg-white dark:bg-[var(--codex-surface)] px-3 py-3 shadow-[0_12px_34px_rgba(15,23,42,0.14)] ring-1 ring-slate-200 dark:ring-white/10 transition duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(15,23,42,0.16)] sm:gap-4 sm:px-4">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onUploadClick("outfit");
              }}
              className="flex size-12 shrink-0 items-center justify-center rounded-[6px] border border-dashed border-slate-300 dark:border-white/15 bg-slate-50 dark:bg-white/5 text-slate-400 dark:text-stone-500 transition duration-[250ms] ease-out hover:border-[var(--codex-accent)] hover:bg-[rgba(91,124,255,0.08)] hover:text-[var(--codex-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(91,124,255,0.35)]"
              aria-label={t("uploadOutfit")}
            >
              <ImagePlus className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={onExpand}
              className="min-w-0 flex-1 rounded-[6px] px-1 py-2 text-left text-sm leading-5 text-slate-500 dark:text-stone-400 transition duration-[250ms] ease-out hover:translate-x-0.5 hover:text-slate-800 dark:text-stone-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(91,124,255,0.35)]"
            >
              <span className="line-clamp-1">{prompt.trim() || t("uploadPlaceholder")}</span>
            </button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="shrink-0 rounded-full bg-slate-800 px-3 text-white shadow-sm transition duration-[250ms] ease-out hover:-translate-y-0.5 hover:bg-slate-700 hover:shadow-md"
              onClick={(event) => {
                event.stopPropagation();
                onJumpToBottom();
              }}
            >
              {t("backToBottom")}
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="expanded"
          initial={{ opacity: 0, y: 34, scale: 0.985, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: 22, scale: 0.985, filter: "blur(4px)" }}
          transition={COMPOSER_MOTION}
          style={{ transformOrigin: "bottom center" }}
          className={cn("pointer-events-auto mx-auto w-full max-w-[980px] will-change-[transform,opacity,filter] motion-reduce:transform-none", className)}
        >
          <div className="rounded-[8px] bg-white dark:bg-[#1c1c1e] p-4 shadow-[0_14px_46px_rgba(15,23,42,0.14)] ring-1 ring-slate-200 dark:ring-white/10 transition duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:shadow-[0_18px_54px_rgba(15,23,42,0.16)] sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 text-[14px] font-semibold leading-5 tracking-normal text-slate-900 dark:text-stone-100">
            {t("composerTitle")}
            <Sparkles className="h-4 w-4 shrink-0 text-[var(--codex-accent)]" />
          </div>
          <div className="flex items-center gap-1.5">
            {assets.length > 0 ? (
              <Button type="button" variant="ghost" size="sm" className="rounded-[6px] text-slate-500 dark:text-stone-400 transition hover:bg-[rgba(91,124,255,0.08)] hover:text-[var(--codex-accent)]" onClick={onClear}>
                <Trash2 className="h-3.5 w-3.5" />
                {t("clearAssets")}
              </Button>
            ) : null}
            <Button type="button" variant="ghost" size="icon-sm" className="rounded-[6px]" aria-label={t("collapseComposer")} onClick={onCollapse}>
              <ChevronsDown className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {assets.map((asset, index) => {
            const label = getCanonicalAssetLabel(index);
            const roleLabel = t(getOutfitFusionRoleLabelKey(asset.role));
            const active = hasPromptAssetReference(prompt, index);
            return (
                <div key={asset.id} className="group relative w-[78px] overflow-hidden rounded-[6px] border border-slate-200 dark:border-white/10 bg-white dark:bg-[#26262a] shadow-sm ring-1 ring-transparent transition duration-200 hover:border-[rgba(91,124,255,0.28)] hover:ring-[rgba(91,124,255,0.22)] hover:shadow-md">
                  <span className={cn("pointer-events-none absolute left-1.5 top-1.5 z-[1] max-w-[70px] truncate rounded border px-1.5 py-0.5 text-[10px] font-bold leading-3 shadow-sm", getAssetLabelTone(asset.role, active))}>
                    {label}
                  </span>
                  <button
                    type="button"
                    onClick={() => onPreviewAsset?.(asset.id)}
                    className="block w-full cursor-zoom-in text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(91,124,255,0.38)]"
                    aria-label={t("previewAsset", { label, role: roleLabel })}
                    title={`${label} · ${roleLabel}`}
                  >
                    <RawPreviewImage src={asset.url} alt={`${label}${roleLabel}`} className="aspect-square w-full object-cover transition duration-300 group-hover:scale-[1.035]" />
                    <div className="truncate border-t border-slate-100 dark:border-white/10 px-1.5 py-1 text-center text-[11px] font-medium leading-4 text-slate-500 dark:text-stone-400">
                      {roleLabel}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveAsset(asset.id)}
                    className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 shadow-sm transition group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    aria-label={t("removeAsset", { label, role: roleLabel })}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
            );
          })}
          {visibleSlots.map((slot) => (
            <UploadSlot
              key={slot.role}
              role={slot.role}
              label={t(slot.labelKey)}
              optionalLabel={slot.optional ? t("uploadSlotOptional") : undefined}
              uploading={uploading}
              onClick={onUploadClick}
              onFiles={onUploadFiles}
            />
          ))}
        </div>

        <HighlightedPromptTextarea
          assets={assets}
          value={prompt}
          onChange={(value) => onPromptChange(value.slice(0, 800))}
          placeholder={t("uploadPlaceholder")}
          compact={compactPrompt}
        />

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="rounded-[6px] bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-stone-300 transition hover:bg-slate-200 dark:hover:bg-white/15"
            onClick={() => void onAutoWrite()}
            disabled={!assets.length || autoWriting}
          >
            {autoWriting ? <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--codex-accent)]" /> : <WandSparkles className="h-3.5 w-3.5" />}
            {autoWriting ? t("analyzingVision") : t("autoWrite")}
          </Button>

          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <span className="min-w-14 text-right text-xs text-slate-500 dark:text-stone-400">{prompt.length}/800</span>
            <OutfitFusionConfigPopover config={config} onChange={onConfigChange} modelLabel={modelLabel} />
            <Button
              type="button"
              className="h-9 rounded-[6px] bg-[var(--codex-accent)] px-4 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(91,124,255,0.24)] transition hover:bg-[#4d6df4] hover:shadow-[0_12px_24px_rgba(91,124,255,0.30)]"
              onClick={onGenerate}
              disabled={!canGenerate}
            >
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {primaryLabel}
              <span className="ml-1 rounded bg-white/16 px-1.5 py-0.5 text-xs">{costLabel}</span>
              {balanceLabel ? <span className="ml-1 hidden rounded bg-white/16 px-1.5 py-0.5 text-xs sm:inline">{balanceLabel}</span> : null}
            </Button>
          </div>
        </div>
      </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function UploadSlot({
  role,
  label,
  optionalLabel,
  uploading,
  onClick,
  onFiles,
}: {
  role: OutfitFusionAssetRole;
  label: string;
  optionalLabel?: string;
  uploading?: boolean;
  onClick: (role: OutfitFusionAssetRole) => void;
  onFiles: (role: OutfitFusionAssetRole, files: File[]) => void;
}) {
  const t = useTranslations("OutfitFusion");
  const [isDragging, setIsDragging] = useState(false);
  const { dragHandlers } = useStableFileDrag<HTMLButtonElement>({
    isDragging,
    setDragging: setIsDragging,
    onFiles: (files) => onFiles(role, files),
    accept: "image/png,image/jpeg,image/jpg,image/webp,image/heic",
    multiple: role === "outfit",
    disabled: uploading,
    stopPropagation: true,
  });

  return (
    <button
      type="button"
      onClick={() => onClick(role)}
      disabled={uploading}
      className={cn(
        "group flex h-[88px] w-[88px] shrink-0 flex-col items-center justify-center gap-2 rounded-[6px] border border-dashed border-slate-300 dark:border-white/15 bg-white dark:bg-[var(--codex-surface)] text-slate-400 dark:text-stone-500 transition duration-200 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/20 hover:text-blue-500 dark:hover:text-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20 focus-visible:ring-offset-1 disabled:cursor-wait disabled:opacity-60",
        isDragging && "border-blue-500 bg-blue-50 text-blue-500 ring-2 ring-blue-500/20"
      )}
      {...dragHandlers}
    >
      {uploading ? <Loader2 className="h-5 w-5 animate-spin text-[var(--codex-accent)]" /> : <Plus className="h-5 w-5 stroke-[1.6] transition duration-200 group-hover:scale-105" />}
      <span className="max-w-[72px] truncate text-center text-[12px] font-normal leading-[17px] tracking-normal text-slate-500 dark:text-stone-400">
        {isDragging ? t("releaseUpload") : (
          <>
            {label}
            {optionalLabel && <span className="ml-0.5 text-slate-300 dark:text-stone-500">{optionalLabel}</span>}
          </>
        )}
      </span>
    </button>
  );
}

function HighlightedPromptTextarea({
  assets,
  value,
  placeholder,
  onChange,
  compact = false,
}: {
  assets: OutfitFusionAsset[];
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  compact?: boolean;
}) {
  const t = useTranslations("OutfitFusion");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [mention, setMention] = useState<{ start: number; query: string; activeIndex: number } | null>(null);
  const [hasTextSelection, setHasTextSelection] = useState(false);
  const assetOptions = useMemo(
    () =>
      assets.map((asset, index) => {
        const label = getCanonicalAssetLabel(index);
        return {
          asset,
          index,
          label,
          roleLabel: t(getOutfitFusionRoleLabelKey(asset.role)),
        };
      }),
    [assets, t]
  );
  const referencedOptions = assetOptions.filter((option) => hasPromptAssetReference(value, option.index));
  const filteredOptions = mention
    ? assetOptions.filter((option) => {
        const query = mention.query.trim().toLowerCase();
        if (!query) return true;
        return option.label.toLowerCase().includes(query) || option.roleLabel.toLowerCase().includes(query);
      })
    : [];
  const hasValue = value.length > 0;
  const showHighlightLayer = hasValue && !hasTextSelection;
  const textMetricsClass = compact ? "min-h-[24px] px-0 py-0 leading-6" : "min-h-[96px] px-3 py-2 leading-7";

  function syncSelectionState(target = textareaRef.current) {
    if (!target) {
      setHasTextSelection(false);
      return;
    }
    setHasTextSelection(target.selectionStart !== target.selectionEnd);
  }

  function updateMention(nextValue: string, caret: number) {
    const beforeCaret = nextValue.slice(0, caret);
    const match = beforeCaret.match(MENTION_QUERY_PATTERN);
    if (!match) {
      setMention(null);
      return;
    }
    setMention({
      start: caret - match[0].length,
      query: match[1] || "",
      activeIndex: 0,
    });
  }

  function insertMention(option: (typeof assetOptions)[number]) {
    const textarea = textareaRef.current;
    const caret = textarea?.selectionStart ?? value.length;
    const start = mention?.start ?? caret;
    const token = option.label;
    const nextValue = `${value.slice(0, start)}${token}${value.slice(caret)}`.slice(0, 800);
    const nextCaret = Math.min(start + token.length, nextValue.length);

    onChange(nextValue);
    setMention(null);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!mention) return;

    if (event.key === "Escape") {
      event.preventDefault();
      setMention(null);
      return;
    }

    if (!filteredOptions.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setMention((current) =>
        current ? { ...current, activeIndex: (current.activeIndex + 1) % filteredOptions.length } : current
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setMention((current) =>
        current ? { ...current, activeIndex: (current.activeIndex - 1 + filteredOptions.length) % filteredOptions.length } : current
      );
      return;
    }

    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      insertMention(filteredOptions[Math.min(mention.activeIndex, filteredOptions.length - 1)]);
    }
  }

  return (
    <div className={cn("relative", compact ? "mt-3" : "mt-3")}>
      <div
        className={cn(
          "relative",
          compact
            ? ""
            : "rounded-[8px] bg-[#f5f8ff] ring-1 ring-[rgba(91,124,255,0.10)] transition focus-within:ring-2 focus-within:ring-[rgba(91,124,255,0.28)] dark:bg-[#1c1c1e] dark:ring-[rgba(91,140,255,0.30)] dark:focus-within:ring-[rgba(91,140,255,0.55)]"
        )}
      >
        {showHighlightLayer ? (
          <div
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-0 z-0 overflow-hidden whitespace-pre-wrap break-words text-[14px] tracking-normal text-slate-900 dark:text-stone-100",
              textMetricsClass,
              compact && "text-slate-500 dark:text-stone-400"
            )}
          >
            {renderHighlightedPrompt(value, assets)}
          </div>
        ) : null}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => {
            const nextValue = event.target.value.slice(0, 800);
            onChange(nextValue);
            updateMention(nextValue, event.target.selectionStart ?? nextValue.length);
          }}
          onKeyDown={handleKeyDown}
          onClick={(event) => updateMention(value, event.currentTarget.selectionStart ?? value.length)}
          onSelect={(event) => {
            const target = event.currentTarget;
            syncSelectionState(target);
            if (target.selectionStart === target.selectionEnd) {
              updateMention(value, target.selectionStart ?? value.length);
            } else {
              setMention(null);
            }
          }}
          onFocus={(event) => syncSelectionState(event.currentTarget)}
          onBlur={() => {
            setMention(null);
            setHasTextSelection(false);
          }}
          onMouseUp={(event) => syncSelectionState(event.currentTarget)}
          onKeyUp={(event) => syncSelectionState(event.currentTarget)}
          placeholder={placeholder}
          maxLength={800}
          rows={compact ? 1 : 3}
          spellCheck={false}
          aria-label={t("promptAria")}
          aria-controls="outfit-fusion-mention-list"
          style={showHighlightLayer ? { WebkitTextFillColor: "transparent" } : undefined}
          className={cn(
            "relative z-10 w-full resize-none border-0 bg-transparent text-[14px] tracking-normal caret-[var(--codex-accent)] outline-none transition placeholder:text-slate-400 dark:placeholder:text-stone-500 selection:bg-[rgba(91,124,255,0.24)]",
            textMetricsClass,
            compact ? "overflow-hidden text-slate-500 dark:text-stone-300 ring-0 focus:ring-0" : "text-slate-900 dark:text-stone-100"
          )}
        />
      </div>
      {mention ? (
        <div
          id="outfit-fusion-mention-list"
          role="listbox"
          className="absolute bottom-full left-3 z-40 mb-2 w-[min(360px,calc(100%-24px))] overflow-hidden rounded-[8px] border border-slate-200 dark:border-white/10 bg-white dark:bg-[var(--codex-surface)] p-1 shadow-[0_18px_42px_rgba(15,23,42,0.18)]"
        >
          {filteredOptions.length ? (
            filteredOptions.map((option, index) => (
              <button
                key={option.asset.id}
                type="button"
                role="option"
                aria-selected={index === mention.activeIndex}
                onMouseDown={(event) => {
                  event.preventDefault();
                  insertMention(option);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-[6px] px-2 py-2 text-left text-sm transition",
                  index === mention.activeIndex
                    ? "bg-[rgba(91,124,255,0.10)] text-[var(--codex-accent)]"
                    : "text-slate-700 dark:text-stone-300 hover:bg-slate-50 dark:bg-white/5"
                )}
              >
                <RawPreviewImage src={option.asset.url} alt="" className="size-9 rounded object-cover ring-1 ring-slate-200 dark:ring-white/10" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold leading-5">{option.label}</span>
                  <span className="block truncate text-xs leading-4 text-slate-500 dark:text-stone-400">{option.roleLabel}</span>
                </span>
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-slate-500 dark:text-stone-400">{assetOptions.length ? t("noMatchAsset") : t("noAssetFirst")}</div>
          )}
        </div>
      ) : null}
      {compact ? null : <div className="mt-2 flex min-h-6 flex-wrap items-center gap-1.5 text-xs leading-5">
        {referencedOptions.length ? (
          <>
            <span className="text-slate-400 dark:text-stone-500">{t("referenced")}</span>
            {referencedOptions.map((option) => (
              <button
                key={option.asset.id}
                type="button"
                onClick={() => insertMention(option)}
                className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-semibold ring-1 transition", getAssetReferenceTone(option.asset.role))}
                title={t("insertAgain", { label: option.label })}
              >
                <RawPreviewImage src={option.asset.url} alt="" className="size-4 rounded object-cover" />
                {option.label}
              </button>
            ))}
          </>
        ) : (
          <span className="text-slate-400 dark:text-stone-500">{t("mentionHint")}</span>
        )}
      </div>}
    </div>
  );
}

const PROMPT_LABEL_PATTERN = /图\d+/g;

function getCanonicalAssetLabel(index: number) {
  return `图${index + 1}`;
}

function hasPromptAssetReference(value: string, index: number) {
  const canonicalLabel = getCanonicalAssetLabel(index);
  return hasPromptToken(value, canonicalLabel);
}

function hasPromptToken(value: string, token: string) {
  if (!value || !token) return false;
  return new RegExp(`(^|[^0-9搭配参考模特])${escapeRegExp(token)}(?!\\d)`).test(value);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function renderHighlightedPrompt(value: string, assets: OutfitFusionAsset[]): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of value.matchAll(PROMPT_LABEL_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push(value.slice(lastIndex, index));
    }

    const token = match[0];
    parts.push(
      <span
        key={`${token}-${index}`}
        className={cn("rounded-[3px] px-0 py-0 font-normal", getPromptLabelTone(token, assets))}
      >
        {token}
      </span>
    );
    lastIndex = index + token.length;
  }

  if (lastIndex < value.length) {
    parts.push(value.slice(lastIndex));
  }

  return parts;
}

function getPromptLabelTone(token: string, assets: OutfitFusionAsset[]) {
  const role = getPromptTokenRole(token, assets);
  if (role === "reference") return "bg-rose-50 text-rose-500";
  if (role === "model") return "bg-amber-50 text-amber-500";
  return "bg-blue-50 text-[#4f6ff4]";
}

function getPromptTokenRole(token: string, assets: OutfitFusionAsset[]): OutfitFusionAssetRole {
  const match = token.match(/^图(\d+)$/);
  const assetIndex = match ? Number(match[1]) - 1 : -1;
  return assets[assetIndex]?.role || "outfit";
}

function getAssetLabelTone(role: OutfitFusionAssetRole, active: boolean) {
  if (role === "reference") {
    return active ? "border-rose-500 bg-rose-500 text-white" : "border-rose-100 bg-rose-50 text-rose-500";
  }
  if (role === "model") {
    return active ? "border-amber-500 bg-amber-500 text-white" : "border-amber-100 bg-amber-50 text-amber-500";
  }
  return active ? "border-[#5b7cff] bg-[#5b7cff] text-white" : "border-blue-100 bg-blue-50 text-[#4f6ff4]";
}

function getAssetReferenceTone(role: OutfitFusionAssetRole) {
  if (role === "reference") return "bg-rose-50 text-rose-500 ring-rose-100 hover:bg-rose-100";
  if (role === "model") return "bg-amber-50 text-amber-500 ring-amber-100 hover:bg-amber-100";
  return "bg-blue-50 text-[#4f6ff4] ring-blue-100 hover:bg-blue-100";
}

function OutfitFusionConfigPopover({
  config,
  onChange,
  modelLabel,
}: {
  config: OutfitFusionConfig;
  onChange: (config: OutfitFusionConfig) => void;
  modelLabel: string;
}) {
  const t = useTranslations("OutfitFusion");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="secondary" className="h-9 w-auto max-w-[calc(100vw-48px)] justify-between gap-1.5 rounded-[6px] bg-slate-100 dark:bg-white/10 px-2.5 text-slate-700 dark:text-stone-300 transition hover:bg-slate-200 dark:hover:bg-white/15 sm:max-w-[340px]">
          <Settings2 className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 max-w-[260px] truncate text-center text-[13px] font-medium leading-5 tracking-normal">
            {getOutfitFusionAspectRatioLabel(config.aspectRatio, t)} · {config.imageSize} · {t("generateCount", { count: config.genCount })} · {modelLabel}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        sideOffset={8}
        avoidCollisions={false}
        className="w-[min(316px,calc(100vw-32px))] overflow-visible rounded-[8px] p-4 shadow-[0_18px_48px_rgba(15,23,42,0.18)]"
      >
        <div className="space-y-4">
          <ControlGroup label={t("aspectRatio")}>
            <Segmented
              ariaLabel={t("aspectRatio")}
              value={config.aspectRatio}
              options={[
                { value: "auto", label: t("smartAspect") },
                { value: "3:4", label: "3:4" },
                { value: "1:1", label: "1:1" },
              ]}
              onChange={(value) => onChange({ ...config, aspectRatio: value as OutfitFusionConfig["aspectRatio"] })}
            />
          </ControlGroup>

          <ControlGroup label={t("genCount")}>
            <Segmented
              ariaLabel={t("genCount")}
              value={String(config.genCount)}
              options={[1, 2, 3, 4].map((count) => ({ value: String(count), label: t("countImage", { count }) }))}
              onChange={(value) => onChange({ ...config, genCount: Number(value) || DEFAULT_OUTFIT_FUSION_CONFIG.genCount })}
            />
          </ControlGroup>

          <ControlGroup label={t("resolution")}>
            <Segmented
              ariaLabel={t("resolution")}
              value={config.imageSize}
              options={IMAGE_SIZES.map((size) => ({ value: size, label: size }))}
              onChange={(value) => onChange({ ...config, imageSize: value as ImageSize })}
            />
          </ControlGroup>

          <div className="grid grid-cols-1 gap-3">
            <ControlGroup label={t("modelSelect")}>
              <InlineConfigSelect
                value={config.aiModel}
                options={OUTFIT_FUSION_MODELS.map((model) => ({ value: model.value, label: model.label }))}
                onChange={(value) => onChange({ ...config, aiModel: value as OutfitFusionConfig["aiModel"] })}
              />
            </ControlGroup>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function getOutfitFusionAspectRatioLabel(value: OutfitFusionConfig["aspectRatio"], t?: (key: string) => string) {
  return value === "auto" ? (t ? t("smartAspect") : "智能") : value;
}

function getOutfitFusionRoleLabelKey(role: OutfitFusionAssetRole) {
  if (role === "reference") return "roles.reference";
  if (role === "model") return "roles.model";
  return "roles.outfit";
}

function ControlGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-[13px] font-medium leading-5 text-slate-700 dark:text-stone-300">{label}</div>
      {children}
    </div>
  );
}

function Segmented({
  ariaLabel,
  value,
  options,
  onChange,
}: {
  ariaLabel: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-8 rounded-[6px] bg-slate-100 dark:bg-white/10 px-2 text-sm text-slate-700 dark:text-stone-300 transition duration-200 hover:bg-slate-200 dark:hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8aa5ff]",
              active && "bg-[#eef4ff] font-semibold text-[#4b6fb3] shadow-sm ring-1 ring-[#cfdcff]"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function InlineConfigSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const active = options.find((option) => option.value === value) || options[0];

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-[6px] border border-[rgba(91,124,255,0.20)] bg-white dark:bg-[var(--codex-surface)] px-3 text-left text-[13px] font-medium text-slate-700 dark:text-stone-300 shadow-sm outline-none transition hover:border-[rgba(91,124,255,0.34)] focus-visible:ring-2 focus-visible:ring-[rgba(91,124,255,0.26)]"
      >
        <span className="min-w-0 truncate">{active?.label || value}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-stone-400 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div
          role="listbox"
          className="absolute left-0 top-[calc(100%+4px)] z-[80] w-full rounded border border-slate-200 dark:border-white/10 bg-white dark:bg-[var(--codex-surface)] p-1 shadow-[0_14px_34px_rgba(15,23,42,0.16)]"
        >
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex h-8 w-full items-center justify-between rounded-[6px] px-2.5 text-left text-[13px] transition",
                  selected
                    ? "bg-[var(--codex-accent)] font-semibold text-white"
                    : "text-slate-700 dark:text-stone-300 hover:bg-[rgba(91,124,255,0.08)] hover:text-[var(--codex-accent)]"
                )}
              >
                <span className="truncate">{option.label}</span>
                {selected ? <Check className="h-3.5 w-3.5" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
