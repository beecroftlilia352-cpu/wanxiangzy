"use client";

import { useState, useEffect, useRef } from "react";
import type { SlashCommand } from "@/lib/agent/slash-commands";
import { filterCommands } from "@/lib/agent/slash-commands";

type Props = {
  query: string;
  visible: boolean;
  onSelect: (command: SlashCommand) => void;
};

export function SlashCommandDropdown({ query, visible, onSelect }: Props) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = filterCommands(query);

  useEffect(() => { setSelectedIdx(0); }, [query, visible]);

  // 键盘导航
  useEffect(() => {
    if (!visible || commands.length === 0) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((prev) => Math.min(prev + 1, commands.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && commands[selectedIdx]) {
        e.preventDefault();
        onSelect(commands[selectedIdx]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onSelect(null as unknown as SlashCommand); // signal close
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [visible, commands, selectedIdx, onSelect]);

  // 滚动到选中项
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-cmd-idx="${selectedIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  if (!visible || commands.length === 0) return null;

  // 按类别分组
  const groups = {
    generation: commands.filter((c) => c.category === "generation"),
    analysis: commands.filter((c) => c.category === "analysis"),
    utility: commands.filter((c) => c.category === "utility"),
  };

  const labels: Record<string, string> = {
    generation: "生图",
    analysis: "分析",
    utility: "工具",
  };

  let globalIdx = 0;

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="快捷指令"
      className="absolute bottom-full left-0 z-50 mb-1 max-h-80 w-72 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
    >
      <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
        快捷指令
      </div>
      {(["generation", "analysis", "utility"] as const).map((cat) => {
        const group = groups[cat];
        if (group.length === 0) return null;
        return (
          <div key={cat}>
            <div className="px-3 py-1 text-[10px] font-bold text-slate-300">{labels[cat]}</div>
            {group.map((cmd) => {
              const idx = globalIdx++;
              return (
                <button
                  key={cmd.id}
                  data-cmd-idx={idx}
                  role="option"
                  aria-selected={idx === selectedIdx}
                  onClick={() => onSelect(cmd)}
                  onMouseEnter={() => setSelectedIdx(idx)}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
                    idx === selectedIdx ? "bg-[rgba(91,124,255,0.1)]" : "hover:bg-[rgba(91,124,255,0.12)]"
                  }`}
                >
                  <span className="text-lg">{cmd.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-800">/{cmd.name}</span>
                      <span className="text-xs text-slate-500">{cmd.label}</span>
                    </div>
                    <p className="text-[11px] text-slate-400">{cmd.description}</p>
                  </div>
                  {cmd.requiresImages && (
                    <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-600">
                      需图片
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
