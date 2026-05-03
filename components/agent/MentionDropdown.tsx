"use client";

import type { ChatImage } from "@/lib/agent/types";

type Props = {
  images: ChatImage[];
  query: string;
  onSelect: (imageIndex: number) => void;
  visible: boolean;
};

export function MentionDropdown({ images, query, onSelect, visible }: Props) {
  if (!visible || images.length === 0) return null;

  const filtered = images.filter((img) => {
    const label = `图${img.index}`;
    return label.includes(query) || img.fileName.toLowerCase().includes(query.toLowerCase());
  });

  if (filtered.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 mb-1 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
      <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
        选择图片
      </div>
      {filtered.map((img) => (
        <button
          key={img.index}
          onClick={() => onSelect(img.index)}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-violet-50"
        >
          <div className="h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-slate-100">
            <img src={img.hostedUrl || img.url} alt={`图${img.index}`} className="h-full w-full object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-sm font-bold text-violet-600">图{img.index}</span>
            <span className="ml-1.5 text-xs text-slate-400">{img.fileName}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
