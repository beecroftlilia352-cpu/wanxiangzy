"use client";

import { Wand2 } from "lucide-react";
import { REPAIR_PRESETS, type RepairKind } from "@/lib/generation-repair";

type RepairPromptPanelProps = {
  kind: RepairKind;
  onRepair: (repairValue: string) => void;
  disabled?: boolean;
  className?: string;
};

export function RepairPromptPanel({ kind, onRepair, disabled = false, className = "" }: RepairPromptPanelProps) {
  const presets = REPAIR_PRESETS[kind];

  return (
    <div className={`rounded-2xl border border-white/70 bg-white/85 p-2 shadow-lg shadow-purple-100/60 backdrop-blur-md ${className}`}>
      <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-bold text-gray-700">
        <Wand2 className="h-3.5 w-3.5 text-purple-500" />
        不满意？选择问题修复
      </div>
      <div className="studio-scrollbar-hide flex gap-1.5 overflow-x-auto pb-0.5 sm:flex-wrap sm:overflow-visible sm:pb-0">
        {presets.map((preset) => (
          <button
            key={preset.value}
            type="button"
            disabled={disabled}
            title={preset.desc}
            onClick={() => onRepair(preset.value)}
            className="rounded-full border border-purple-100 bg-purple-50/80 px-2.5 py-1 text-[11px] font-medium text-purple-700 transition-all hover:border-purple-300 hover:bg-purple-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {preset.label}
          </button>
        ))}
      </div>
    </div>
  );
}
