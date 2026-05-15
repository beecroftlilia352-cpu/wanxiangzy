"use client";

import { useState, useEffect, useRef } from "react";
import type { ChatImage } from "@/lib/agent/types";

type Props = {
  images: ChatImage[];
  query: string;
  onSelect: (imageIndex: number) => void;
  visible: boolean;
};

const ROLE_LABELS: Record<string, string> = {
  auto: "自动",
  clothing: "服装",
  reference: "参考",
  face: "脸图",
  background: "背景",
  source: "原图",
};

export function MentionDropdown({ images, query, onSelect, visible }: Props) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = images.filter((img) => {
    const label = `图${img.index}`;
    return label.includes(query) || img.fileName.toLowerCase().includes(query.toLowerCase());
  });

  // 重置选中索引
  useEffect(() => { setSelectedIdx(0); }, [query, visible]);

  // 暴露键盘处理给父组件
  useEffect(() => {
    if (!visible || filtered.length === 0) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((prev) => Math.min(prev + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && filtered[selectedIdx]) {
        e.preventDefault();
        onSelect(filtered[selectedIdx].index);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onSelect(-1); // signal to close
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [visible, filtered, selectedIdx, onSelect]);

  // 滚动到选中项
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selectedIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  if (!visible || filtered.length === 0) return null;

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="选择引用图片"
      className="absolute bottom-full left-0 z-50 mb-1 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
    >
      <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
        选择图片（↑↓ 选择，Enter 确认）
      </div>
      {filtered.map((img, idx) => (
        <button
          key={img.index}
          data-idx={idx}
          role="option"
          aria-selected={idx === selectedIdx}
          onClick={() => onSelect(img.index)}
          onMouseEnter={() => setSelectedIdx(idx)}
          className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors ${
            idx === selectedIdx ? "bg-[rgba(91,124,255,0.1)]" : "hover:bg-[rgba(91,124,255,0.12)]"
          }`}
        >
          <div className="studio-checkerboard h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-slate-100">
            <img src={img.hostedUrl || img.url} alt={`图${img.index}`} className="h-full w-full object-contain p-0.5" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-sm font-bold text-[var(--codex-accent)]">图{img.index}</span>
            <span className="ml-1.5 text-xs text-slate-400">{ROLE_LABELS[img.role || "auto"] || "自动"}</span>
            <span className="ml-1.5 text-xs text-slate-300">{img.fileName}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
