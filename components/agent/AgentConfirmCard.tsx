"use client";

import { Sparkles } from "lucide-react";
import type { AgentTask } from "@/lib/agent/types";

const MODULE_LABELS: Record<string, string> = {
  tryon: "服装上身",
  grass: "服装种草图",
  model: "专属模特",
  pose: "姿势裂变",
  model_background: "换背景/换模特",
  garment_3d: "服装 3D",
};

type Props = {
  task: AgentTask;
  onConfirm: () => void;
};

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

export function AgentConfirmCard({ task, onConfirm }: Props) {
  const p = task.params;
  const fields = [
    { label: "模型", value: str(p.ai_model) },
    { label: "比例", value: str(p.aspect_ratio) },
    { label: "尺寸", value: str(p.image_size) },
    { label: "张数", value: str(p.gen_count) ? `${str(p.gen_count)} 张` : "" },
    { label: "风格", value: str(p.style) },
  ].filter((f) => f.value);

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-violet-200 bg-violet-50/50 p-3">
      <div className="flex items-center gap-2 text-sm font-bold text-violet-700">
        <Sparkles className="h-4 w-4" />
        确认生成参数
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <ParamCell label="模块" value={MODULE_LABELS[task.module] || task.module} />
        {fields.map((f) => (
          <ParamCell key={f.label} label={f.label} value={f.value} />
        ))}
        <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
          <span className="text-amber-600">预估积分</span>
          <span className="block font-bold text-amber-700">生成后扣减</span>
        </div>
      </div>

      <button
        onClick={onConfirm}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 py-2.5 text-sm font-bold text-white shadow-lg shadow-violet-200 transition-opacity hover:opacity-90"
      >
        <Sparkles className="h-4 w-4" />
        确认生成
      </button>
    </div>
  );
}

function ParamCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-white px-3 py-2">
      <span className="text-slate-400">{label}</span>
      <span className="block truncate font-semibold text-slate-800">{value}</span>
    </div>
  );
}
