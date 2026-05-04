"use client";

import { X } from "lucide-react";
import { RepairPromptPanel } from "@/components/RepairPromptPanel";

type ErrorStageProps = {
  error: string;
  onRetry: () => void;
  onRepair: (repairValue: string) => void;
  isGenerating: boolean;
  repairKind: "tryon" | "model" | "pose" | "garment3d" | "grass" | "modelBackground";
};

export function ErrorStage({ error, onRetry, onRepair, isGenerating, repairKind }: ErrorStageProps) {
  return (
    <div className="studio-result-stage min-h-[260px] sm:min-h-[360px] lg:h-full flex items-center justify-center animate-fade-in px-4">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-red-100 flex items-center justify-center">
          <X className="w-8 h-8 text-red-400" />
        </div>
        <p className="text-red-500 font-medium mb-1">生成失败</p>
        <p className="text-sm text-gray-400 mb-4 max-w-sm">{error}</p>
        <RepairPromptPanel kind={repairKind} onRepair={onRepair} disabled={isGenerating} className="mb-3 max-w-md mx-auto" />
        <button onClick={onRetry} className="px-5 py-2 rounded-full border text-sm font-medium hover:bg-gray-50">
          重试
        </button>
      </div>
    </div>
  );
}
