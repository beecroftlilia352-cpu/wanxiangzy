"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { ClientPortal } from "@/components/ClientPortal";
import type {
  ImageTranslationLanguageConfig,
  ImageTranslationLanguageCode,
} from "@/lib/image-translation";
import { flattenImageTranslationLanguages, pickCommonImageTranslationLanguages } from "@/lib/image-translation";
import { cn } from "@/lib/utils";

export type LanguagePickerModalProps = {
  open: boolean;
  onClose: () => void;
  config: ImageTranslationLanguageConfig;
  selected: string[];
  onChange: (next: string[]) => void;
  title?: string;
  description?: string;
  /** 最大可选语种数 */
  maxCount?: number;
};

export function LanguagePickerModal({
  open,
  onClose,
  config,
  selected,
  onChange,
  title = "全部语言",
  description,
  maxCount,
}: LanguagePickerModalProps) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const allLanguages = useMemo(() => flattenImageTranslationLanguages(config), [config]);
  const commonLanguages = useMemo(() => pickCommonImageTranslationLanguages(config), [config]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredRegions = useMemo(() => {
    if (!normalizedQuery) return config;
    return config
      .map((region) => ({
        ...region,
        children: region.children
          .map((group) =>
            group.filter(
              (entry) =>
                entry.label.toLowerCase().includes(normalizedQuery) ||
                (entry.enLabel && entry.enLabel.toLowerCase().includes(normalizedQuery))
            )
          )
          .filter((group) => group.length > 0),
      }))
      .filter((region) => region.children.length > 0);
  }, [config, normalizedQuery]);

  const visibleCommon = useMemo(() => {
    if (!normalizedQuery) return commonLanguages;
    return commonLanguages.filter(
      (lang) =>
        lang.label.toLowerCase().includes(normalizedQuery) ||
        lang.enLabel.toLowerCase().includes(normalizedQuery)
    );
  }, [commonLanguages, normalizedQuery]);

  const totalSelected = selected.length;
  const max = maxCount ?? 0;
  const toggle = (code: string) => {
    if (selected.includes(code)) {
      onChange(selected.filter((item) => item !== code));
      return;
    }
    if (max > 0 && selected.length >= max) return;
    onChange([...selected, code]);
  };

  if (!open) return null;

  return (
    <ClientPortal>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed inset-0 z-[260] flex items-end justify-center bg-slate-950/45 px-3 py-6 backdrop-blur-md sm:items-center sm:px-6"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div
          className="relative flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/80 bg-white/95 shadow-[0_28px_90px_rgba(15,23,42,0.18)] backdrop-blur-2xl animate-fade-in"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
            <div className="min-w-0">
              <h2 className="text-base font-black text-slate-900">{title}</h2>
              <p className="mt-1 text-xs text-slate-500">
                {description || "支持 180+ 国家与地区语言，本地化写法保留变音符号、简繁与字符集。"}
              </p>
              <p className="mt-1 text-[11px] font-semibold text-violet-600">
                已选 {totalSelected}
                {max > 0 ? `/${max}` : ""} 种
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭"
              className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="border-b border-slate-100 px-5 py-3">
            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm shadow-inner focus-within:border-violet-300 focus-within:ring-2 focus-within:ring-violet-100">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索目标语言"
                className="flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
                aria-label="搜索目标语言"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4" style={{ scrollbarGutter: "stable" as const }}>
            {!normalizedQuery && visibleCommon.length > 0 ? (
              <section className="mb-5">
                <h3 className="mb-3 text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">常用推荐</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {visibleCommon.map((lang) => {
                    const checked = selected.includes(lang.code);
                    const disabled = max > 0 && !checked && selected.length >= max;
                    return (
                      <LanguageChip key={lang.code} lang={lang} checked={checked} disabled={disabled} onToggle={() => toggle(lang.code)} />
                    );
                  })}
                </div>
              </section>
            ) : null}

            {filteredRegions.map((region) => {
              const isCollapsed = collapsed[region.label] === true && !normalizedQuery;
              return (
                <section key={region.label} className="mb-6">
                  <button
                    type="button"
                    onClick={() => setCollapsed((prev) => ({ ...prev, [region.label]: !prev[region.label] }))}
                    className="mb-2 flex w-full items-center justify-between text-left text-[11px] font-black uppercase tracking-[0.16em] text-slate-500"
                  >
                    <span>{region.label}</span>
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 transition-transform",
                        isCollapsed ? "-rotate-90" : "rotate-0"
                      )}
                    />
                  </button>
                  {!isCollapsed ? (
                    <div className="space-y-4">
                      {region.children.map((group, groupIndex) => {
                        const flat = group
                          .map((entry) => allLanguages.find((lang) => lang.code === ((entry.enLabel && entry.enLabel.trim()) || entry.label.trim())))
                          .filter((lang): lang is ImageTranslationLanguageCode => Boolean(lang));
                        if (!flat.length) return null;
                        return (
                          <div
                            key={`${region.label}-${groupIndex}-${flat[0]?.code || groupIndex}`}
                            className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4"
                          >
                            {flat.map((lang) => {
                              const checked = selected.includes(lang.code);
                              const disabled = max > 0 && !checked && selected.length >= max;
                              return (
                                <LanguageChip key={lang.code} lang={lang} checked={checked} disabled={disabled} onToggle={() => toggle(lang.code)} />
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </section>
              );
            })}

            {filteredRegions.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-400">没有匹配的语言，请尝试其他关键词。</p>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/80 px-5 py-3">
            <p className="text-xs text-slate-500">点击语言卡可选/取消，最多支持 {max || "20"} 种目标语言。</p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-[var(--codex-accent)] px-5 py-2 text-sm font-black text-white shadow-sm transition hover:opacity-90"
            >
              完成选择
            </button>
          </div>
        </div>
      </div>
    </ClientPortal>
  );
}

function LanguageChip({
  lang,
  checked,
  disabled,
  onToggle,
}: {
  lang: ImageTranslationLanguageCode;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={checked}
      className={cn(
        "group relative flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-2xl border px-3 py-2 text-center transition",
        checked
          ? "border-violet-500 bg-violet-50 text-violet-700 shadow-sm ring-1 ring-violet-200"
          : "border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:bg-violet-50/40",
        disabled && "cursor-not-allowed opacity-40 hover:border-slate-200 hover:bg-white"
      )}
    >
      <span className="text-sm font-black leading-tight">{lang.label}</span>
      <span className="truncate text-[10px] font-medium text-slate-400" title={lang.enLabel}>
        {lang.enLabel}
      </span>
      {checked ? (
        <span className="absolute right-1.5 top-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-violet-500 text-white">
          <Check className="h-3 w-3" />
        </span>
      ) : null}
    </button>
  );
}
