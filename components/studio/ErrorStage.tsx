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
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
          <X className="h-8 w-8 text-red-500" />
        </div>
        <p className="mb-1 font-semibold text-red-600">生成失败</p>
        <p className="mx-auto mb-4 max-w-sm text-sm text-codex-muted">{error}</p>
        <RepairPromptPanel kind={repairKind} onRepair={onRepair} disabled={isGenerating} className="mb-3 max-w-md mx-auto" />
        <button onClick={onRetry} className="mac-button px-5 py-2 text-sm">
          重试
        </button>
      </div>
    </div>
  );
}
