"use client";

import { Brush } from "lucide-react";
import { REPAIR_PRESETS, type RepairKind } from "@/lib/generation-repair";

type RepairPromptPanelProps = {
  kind: RepairKind;
  onRepair: (repairValue: string) => void;
  priorityValues?: string[];
  disabled?: boolean;
  className?: string;
};

export function RepairPromptPanel({ kind, onRepair, priorityValues = [], disabled = false, className = "" }: RepairPromptPanelProps) {
  const presets = REPAIR_PRESETS[kind];
  const priority = priorityValues
    .map((value) => presets.find((preset) => preset.value === value))
    .filter((preset): preset is (typeof presets)[number] => Boolean(preset));
  const rest = presets.filter((preset) => !priority.some((item) => item.value === preset.value));
  const orderedPresets = [...priority, ...rest];

  return (
    <div className={`rounded-2xl border border-white/70 bg-white/85 p-2 shadow-lg shadow-slate-300/40 backdrop-blur-md ${className}`}>
      <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-bold text-gray-700">
        <Brush className="h-3.5 w-3.5 text-[var(--codex-accent)]0" />
        不满意？选择问题修复
      </div>
      <div className="studio-scrollbar-hide flex gap-1.5 overflow-x-auto pb-0.5 sm:flex-wrap sm:overflow-visible sm:pb-0">
        {orderedPresets.map((preset) => (
          <button
            key={preset.value}
            type="button"
            disabled={disabled}
            title={preset.desc}
            onClick={() => onRepair(preset.value)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
              priority.some((item) => item.value === preset.value)
                ? "border-rose-100 bg-rose-50 text-rose-700 hover:border-rose-300 hover:bg-rose-100"
                : "border-[rgba(91,124,255,0.22)] bg-[rgba(91,124,255,0.1)] text-[var(--codex-accent)] hover:border-[rgba(91,124,255,0.3)] hover:bg-[rgba(91,124,255,0.12)]"
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}
