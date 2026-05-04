"use client";

import { Loader2, CheckCircle2, Circle, AlertCircle, ChevronRight, Sparkles, Image as ImageIcon, Palette, Wand2, User, Images, PersonStanding, Box, Camera } from "lucide-react";

type StepStatus = "pending" | "running" | "completed" | "failed";

interface PlanStep {
  id: string;
  tool: string;
  label: string;
  description: string;
  params: Record<string, unknown>;
  depends_on: string[];
  status: StepStatus;
  result?: { text?: string; images?: string[] };
}

interface TaskPlanProps {
  title: string;
  steps: PlanStep[];
  overallStatus: "planning" | "executing" | "completed" | "failed";
  onApprove?: () => void;
  onOpenImage?: (url: string) => void;
}

const TOOL_ICONS: Record<string, React.ReactNode> = {
  analyze_image: <ImageIcon className="h-3.5 w-3.5" />,
  generate_tryon: <Sparkles className="h-3.5 w-3.5" />,
  generate_grass: <Camera className="h-3.5 w-3.5" />,
  generate_model: <User className="h-3.5 w-3.5" />,
  generate_background: <Images className="h-3.5 w-3.5" />,
  generate_pose: <PersonStanding className="h-3.5 w-3.5" />,
  generate_3d: <Box className="h-3.5 w-3.5" />,
  style_advice: <Palette className="h-3.5 w-3.5" />,
  optimize_prompt: <Wand2 className="h-3.5 w-3.5" />,
};

const TOOL_LABELS: Record<string, string> = {
  analyze_image: "图片分析",
  generate_tryon: "服装上身",
  generate_grass: "种草图",
  generate_model: "专属模特",
  generate_background: "换背景",
  generate_pose: "姿势裂变",
  generate_3d: "3D 展示",
  style_advice: "风格建议",
  optimize_prompt: "提示词优化",
};

const STATUS_COLORS: Record<StepStatus, string> = {
  pending: "border-slate-200 bg-white text-slate-400",
  running: "border-violet-300 bg-violet-50 text-violet-600",
  completed: "border-emerald-300 bg-emerald-50 text-emerald-600",
  failed: "border-red-300 bg-red-50 text-red-600",
};

export function TaskPlan({ title, steps, overallStatus, onApprove, onOpenImage }: TaskPlanProps) {
  const completedCount = steps.filter((s) => s.status === "completed").length;
  const isExecuting = overallStatus === "executing";

  return (
    <div className="mt-1.5 w-full max-w-md rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
      {/* 头部 */}
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-100">
          <Wand2 className="h-3.5 w-3.5 text-violet-600" />
        </div>
        <span className="text-xs font-bold text-slate-800">{title}</span>
        <div className="flex-1" />
        {isExecuting && (
          <span className="text-[10px] font-medium text-violet-500">
            {completedCount}/{steps.length}
          </span>
        )}
      </div>

      {/* 步骤列表 */}
      <div className="px-4 py-3">
        <div className="space-y-0">
          {steps.map((step, i) => (
            <div key={step.id} className="flex gap-3">
              {/* 左侧时间线 */}
              <div className="flex flex-col items-center">
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-all ${STATUS_COLORS[step.status]}`}>
                  {step.status === "pending" && <Circle className="h-3 w-3" />}
                  {step.status === "running" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {step.status === "completed" && <CheckCircle2 className="h-3.5 w-3.5" />}
                  {step.status === "failed" && <AlertCircle className="h-3.5 w-3.5" />}
                </div>
                {i < steps.length - 1 && (
                  <div className={`w-0.5 flex-1 min-h-[24px] ${
                    step.status === "completed" ? "bg-emerald-300" : "bg-slate-200"
                  }`} />
                )}
              </div>

              {/* 右侧内容 */}
              <div className="min-w-0 flex-1 pb-4">
                <div className="flex items-center gap-1.5">
                  <span className="text-violet-400">{TOOL_ICONS[step.tool] || <Sparkles className="h-3.5 w-3.5" />}</span>
                  <span className="text-[13px] font-semibold text-slate-800">{step.label}</span>
                  {step.status === "running" && (
                    <span className="ml-1 text-[10px] font-medium text-violet-500 animate-pulse">执行中...</span>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-slate-400 leading-relaxed">{step.description}</p>

                {/* 步骤结果 */}
                {step.result?.images && step.result.images.length > 0 && (
                  <div className="mt-2 flex gap-1.5">
                    {step.result.images.map((url, j) => (
                      <div key={j}
                        className="h-16 w-16 cursor-pointer overflow-hidden rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
                        onClick={() => onOpenImage?.(url)}>
                        <img src={url} alt={`结果 ${j + 1}`} className="h-full w-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}

                {step.result?.text && (
                  <p className="mt-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600 leading-relaxed">
                    {step.result.text.length > 200 ? step.result.text.slice(0, 200) + "..." : step.result.text}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 底部操作 */}
      {overallStatus === "planning" && onApprove && (
        <div className="border-t border-slate-100 px-4 py-2.5 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">{steps.length} 个步骤</span>
          <button
            onClick={onApprove}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-pink-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-violet-200 hover:opacity-90 transition-opacity"
          >
            <Sparkles className="h-3.5 w-3.5" />
            开始执行
          </button>
        </div>
      )}

      {overallStatus === "completed" && (
        <div className="border-t border-emerald-100 bg-emerald-50/50 px-4 py-2 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          <span className="text-xs font-bold text-emerald-700">全部完成</span>
        </div>
      )}

      {overallStatus === "failed" && (
        <div className="border-t border-red-100 bg-red-50/50 px-4 py-2 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-red-500" />
          <span className="text-xs font-bold text-red-700">部分步骤失败</span>
        </div>
      )}
    </div>
  );
}
