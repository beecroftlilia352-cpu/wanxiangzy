"use client";

import { motion } from "framer-motion";
import { Bot, User, Loader2, CheckCircle2, AlertCircle, Download, ZoomIn, RefreshCw, Copy, Sparkles, ChevronDown, Pencil, Check, X, ThumbsUp, ThumbsDown, Activity } from "lucide-react";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AspectRatio, ImageSize, LingyaModel } from "@/lib/api/lingya";
import type { AgentTaskBrief, ChatImage, ChatImageRole, GenerationParams, Message } from "@/lib/agent/types";
import type {
  WorkflowAssetRecord,
  WorkflowCostEstimate,
  WorkflowEventRecord,
  WorkflowRecord,
  WorkflowStatus,
  WorkflowStepRecord,
} from "@/lib/agent/workflow/types";
import { validateConfirmImageRoles } from "@/lib/agent/confirm-role-params";
import { renderMentionSegments } from "@/lib/agent/mention-parser";
import { RepairPromptPanel } from "@/components/RepairPromptPanel";
import type { RepairKind } from "@/lib/generation-repair";
import { downloadImage, generateDownloadFilename } from "@/lib/utils";

type Props = {
  message: Message;
  prevMessage?: Message;
  sessionImages: ChatImage[];
  onOpenImage: (url: string) => void;
  onRetry: (messageId: string) => void;
  onConfirm?: (messageId: string) => void;
  onConfirmWorkflow?: (messageId: string) => void;
  onCancelWorkflow?: (messageId: string) => void;
  onRetryWorkflowStep?: (messageId: string, stepId: string) => void;
  onSkipWorkflowStep?: (messageId: string, stepId: string) => void;
  onSelectWorkflowStepImage?: (messageId: string, stepId: string, selectedImageUrl: string) => void;
  onEditWorkflowStep?: (messageId: string, stepId: string, patch: { title?: string; params?: Record<string, unknown>; input?: Record<string, unknown> }) => void;
  onRepair?: (messageId: string, repairValue: string) => void;
  onUpdateConfirmParams?: (messageId: string, params: Partial<GenerationParams>) => void;
  onUpdateConfirmImageRole?: (messageId: string, imageIndex: number, role: ChatImageRole) => void;
  onUseAsReference?: (url: string) => void;
  onFeedback?: (messageId: string, rating: "good" | "bad", reason?: string, tags?: string[]) => void;
  onQuickAction?: (text: string) => void;
};

type WorkflowClientPayload = {
  workflow: WorkflowRecord;
  steps: WorkflowStepRecord[];
  events?: WorkflowEventRecord[];
  assets?: WorkflowAssetRecord[];
  costEstimate?: WorkflowCostEstimate;
};

const CONFIRM_MODEL_OPTIONS: Array<{ value: LingyaModel; label: string }> = [
  { value: "gpt-image-2", label: "GPT Image" },
  { value: "nano-banana-2", label: "Nano Banana" },
  { value: "nano-banana-pro", label: "Nano Pro" },
  { value: "doubao-seedream-4-5-251128", label: "Seedream" },
];

const CONFIRM_RATIO_OPTIONS: Array<{ value: AspectRatio; label: string }> = [
  { value: "3:4", label: "3:4" },
  { value: "1:1", label: "1:1" },
  { value: "9:16", label: "9:16" },
  { value: "4:3", label: "4:3" },
  { value: "16:9", label: "16:9" },
];

const CONFIRM_SIZE_OPTIONS: Array<{ value: ImageSize; label: string }> = [
  { value: "1K", label: "1K" },
  { value: "2K", label: "2K" },
  { value: "4K", label: "4K" },
];

const CONFIRM_ROLE_OPTIONS: Array<{ value: ChatImageRole; label: string }> = [
  { value: "auto", label: "自动" },
  { value: "clothing", label: "服装" },
  { value: "reference", label: "参考" },
  { value: "face", label: "脸图" },
  { value: "background", label: "背景" },
  { value: "source", label: "原图" },
];

export function MessageBubble({ message, prevMessage, sessionImages, onOpenImage, onRetry, onConfirm, onConfirmWorkflow, onCancelWorkflow, onRetryWorkflowStep, onSkipWorkflowStep, onSelectWorkflowStepImage, onEditWorkflowStep, onRepair, onUpdateConfirmParams, onUpdateConfirmImageRole, onUseAsReference, onFeedback, onQuickAction }: Props) {
  const { role, content, images, generation, created_at } = message;
  const [copied, setCopied] = useState(false);

  if (role === "system") {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-center py-1">
        <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] text-slate-400">{content}</span>
      </motion.div>
    );
  }

  const isUser = role === "user";
  const workflowPayload = !isUser ? getWorkflowPayload(message.params) : null;
  const agentTimeline = !isUser
    ? normalizeAgentTimelineForMessage(readAgentTimeline(message.params), workflowPayload, generation)
    : [];
  const hasTimeline = agentTimeline.length > 0;
  if (!isUser && !content && !generation && !hasTimeline && !workflowPayload) return null;

  // 消息分组：同角色连续消息隐藏头像
  const isGrouped = prevMessage && prevMessage.role === role;
  const confirmImages = prevMessage?.role === "user" && prevMessage.images?.length
    ? prevMessage.images
    : sessionImages;
  const traceId = !isUser ? getTraceId(message.params) : null;
  const feedback = !isUser ? getMessageFeedback(message.params) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : ""} ${isGrouped ? "mt-0.5" : "mt-3"}`}
    >
      {/* 头像（分组时隐藏） */}
      {isGrouped ? (
        <div className="w-7 shrink-0" />
      ) : (
        <div className={`mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          isUser ? "bg-violet-600 text-white" : "bg-gradient-to-br from-violet-500 to-pink-500 text-white shadow-sm shadow-violet-200"
        }`}>
          {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
        </div>
      )}

      <div className={`flex min-w-0 max-w-[88%] flex-col ${isUser ? "items-end sm:max-w-[75%]" : "items-start sm:max-w-[78%]"}`}>
        {/* 名称 + 时间（分组时只显示时间） */}
        {!isGrouped && (
          <div className={`mb-1 flex items-center gap-2 text-[11px] text-slate-400 ${isUser ? "flex-row-reverse" : ""}`}>
            <span className="font-medium">{isUser ? "你" : "AI 助手"}</span>
            <span className="text-slate-300">·</span>
            <span>{formatTime(created_at)}</span>
          </div>
        )}

        {/* 用户消息：图片在文字前 */}
        {isUser && images && images.length > 0 && (
          <div className="mb-1 flex flex-wrap gap-1">
            {images.map((img, i) => (
              <button key={i} onClick={() => onOpenImage(img.url)}
                className="group relative h-12 w-12 overflow-hidden rounded-lg border border-violet-200 shadow-sm transition-transform hover:scale-105">
                <img src={img.url} alt={`图${img.index}`} className="h-full w-full object-cover" />
                <span className="absolute bottom-0 left-0 right-0 bg-violet-600/80 text-center text-[8px] font-bold leading-tight text-white">图{img.index}</span>
              </button>
            ))}
          </div>
        )}

        {/* 文本内容 */}
        {!isUser && hasTimeline && !content && (
          <AgentRuntimeTimeline timeline={agentTimeline} />
        )}

        {content && (
          <div className={`group/msg relative rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
            isUser
              ? "rounded-br-md bg-violet-600 text-white"
              : "rounded-bl-md border border-slate-200/80 bg-white/95 text-slate-800 backdrop-blur"
          }`}>
            {isUser ? (
              <div className="whitespace-pre-wrap">
                {renderMentionSegments(content).map((seg, i) =>
                  seg.type === "mention" ? (
                    <span key={i} className="inline-flex items-center gap-0.5 rounded-md bg-white/20 px-1.5 py-0.5 font-bold text-white/90">{seg.value}</span>
                  ) : (
                    <span key={i}>{seg.value}</span>
                  )
                )}
              </div>
            ) : (
              <div className="prose-agent">
                <StreamingMarkdown content={content} done={message.streamingDone} />
              </div>
            )}

            {!isUser && hasTimeline && (
              <AgentRuntimeTimeline timeline={agentTimeline} compact />
            )}

            {/* 消息操作栏 */}
            {!isUser && (
              <div className="mt-2 flex items-center gap-1 border-t border-slate-100 pt-1.5">
                <button
                  onClick={() => { navigator.clipboard.writeText(content); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                  className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                >
                  {copied ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                  {copied ? "已复制" : "复制"}
                </button>
                {traceId && <AgentTracePanel traceId={traceId} />}
                {onFeedback && (
                  <div className="ml-auto flex items-center gap-0.5">
                    <button
                      onClick={() => onFeedback(message.id, "good", "结果符合预期", ["quick_positive"])}
                      className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] transition-colors ${
                        feedback?.rating === "good" ? "bg-emerald-50 text-emerald-600" : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      }`}
                      title="这次判断正确"
                    >
                      <ThumbsUp className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => onFeedback(message.id, "bad", "用户标记这次判断或结果不符合预期", ["quick_negative"])}
                      className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] transition-colors ${
                        feedback?.rating === "bad" ? "bg-rose-50 text-rose-600" : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      }`}
                      title="这次判断不对"
                    >
                      <ThumbsDown className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ===== 确认生成卡片（等待用户确认） ===== */}
        {!isUser && content && onQuickAction && isAmbiguousClarifyMessage(content) && (
          <ClarifyQuickReplies onSelect={onQuickAction} />
        )}

        {workflowPayload && (
          <WorkflowExecutionCard
            payload={workflowPayload}
            onConfirm={() => onConfirmWorkflow?.(message.id)}
            onCancel={() => onCancelWorkflow?.(message.id)}
            onRetryStep={(stepId) => onRetryWorkflowStep?.(message.id, stepId)}
            onSkipStep={(stepId) => onSkipWorkflowStep?.(message.id, stepId)}
            onSelectImage={(stepId, url) => onSelectWorkflowStepImage?.(message.id, stepId, url)}
            onEditStep={(stepId, patch) => onEditWorkflowStep?.(message.id, stepId, patch)}
            onOpenImage={onOpenImage}
          />
        )}

        {generation && generation.status === "pending" && generation._confirmData && (
          <div className="mt-2 w-full max-w-sm rounded-xl border border-amber-200 bg-amber-50/50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-800">{generation.module || "图像生成"}</p>
                <p className="text-[11px] text-slate-500">确认后将扣除积分并开始生成</p>
              </div>
              <div className="rounded-lg bg-amber-100 px-3 py-1.5 text-center">
                <p className="text-lg font-black text-amber-700">{generation.creditsUsed || 0}</p>
                <p className="text-[10px] text-amber-600">积分</p>
              </div>
            </div>
            <ConfirmParamsEditor
              messageId={message.id}
              params={readConfirmParams(generation._confirmData.params)}
              onChange={onUpdateConfirmParams}
            />
            <ConfirmPromptEditor
              messageId={message.id}
              prompt={readConfirmParams(generation._confirmData.params).prompt || ""}
              onChange={onUpdateConfirmParams}
            />
            <ConfirmImageRoleEditor
              messageId={message.id}
              images={confirmImages}
              onPreview={onOpenImage}
              onChange={onUpdateConfirmImageRole}
            />
            <ConfirmRoleIssues
              issues={validateConfirmImageRoles(generation._confirmData.module, generation._confirmData.params, confirmImages)}
            />
            <ConfirmExecutionSummaryV2
              moduleName={generation.module || "图像生成"}
              images={confirmImages}
              params={generation._confirmData.params}
              jobPayload={generation._confirmData.jobPayload}
              credits={generation.creditsUsed || generation._confirmData.creditsCost}
            />
            <ConfirmIntentBrief
              moduleName={generation.module || "\u56fe\u50cf\u751f\u6210"}
              images={confirmImages}
              params={generation._confirmData.params}
              jobPayload={generation._confirmData.jobPayload}
              taskBrief={generation._confirmData.taskBrief}
            />
            <ConfirmTaskPlanV2
              moduleName={generation.module || "图像生成"}
              params={readConfirmParams(generation._confirmData.params)}
              credits={generation.creditsUsed || generation._confirmData.creditsCost}
            />
            <button
              onClick={() => !hasConfirmRoleErrors(generation._confirmData!.module, generation._confirmData!.params, confirmImages) && onConfirm?.(message.id)}
              disabled={hasConfirmRoleErrors(generation._confirmData!.module, generation._confirmData!.params, confirmImages)}
              className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white shadow-lg transition-opacity ${
                hasConfirmRoleErrors(generation._confirmData!.module, generation._confirmData!.params, confirmImages)
                  ? "cursor-not-allowed bg-slate-300 shadow-none"
                  : "bg-gradient-to-r from-violet-600 to-pink-600 shadow-violet-200 hover:opacity-90"
              }`}
            >
              <Sparkles className="h-4 w-4" />
              确认生成
            </button>
          </div>
        )}

        {/* ===== 生成中卡片 ===== */}
        {generation && generation.status === "generating" && (
          <div className="mt-1.5 inline-flex flex-col gap-2">
            {/* 图片占位方框（GPT 风格） */}
            <div className="gen-card relative overflow-hidden rounded-2xl border border-slate-200/60 bg-gradient-to-br from-slate-100 via-violet-50 to-pink-50 shadow-sm"
              style={{ width: "min(280px, 70vw)", aspectRatio: "3/4" }}>
              {/* 扫光动画 */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent"
                style={{ animation: "gen-shimmer 2s ease-in-out infinite", backgroundSize: "200% 100%" }} />
              {/* 中心内容 */}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <div className="relative flex h-12 w-12 items-center justify-center">
                  <div className="gen-ring absolute inset-0 rounded-full bg-violet-300/40" />
                  <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-white/80 shadow-lg backdrop-blur-sm">
                    <Sparkles className="gen-icon h-6 w-6 text-violet-500" />
                  </div>
                </div>
                <span className="text-lg font-black tabular-nums text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-pink-600">
                  {generation.progress}%
                </span>
                <p className="text-xs font-medium text-slate-500">
                  {generation.progress < 15 ? "准备中..." :
                   generation.progress < 50 ? "AI 绘制中..." :
                   generation.progress < 90 ? "即将完成..." : "处理中..."}
                </p>
              </div>
            </div>
            {/* 模块标签 + 进度条 */}
            <div className="flex items-center gap-2 px-1">
              <span className="text-[11px] font-medium text-violet-500">{generation.module || "图像生成"}</span>
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-200">
                <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-pink-500 transition-all duration-700"
                  style={{ width: `${Math.max(generation.progress, 5)}%` }} />
              </div>
            </div>
          </div>
        )}

        {/* 生成完成 */}
        {generation && generation.status === "completed" && generation.resultUrls.length > 0 && (
          <div className="mt-1.5 w-full max-w-md">
            <div className="mb-2 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <span className="text-xs font-bold text-emerald-700">生成完成</span>
              <div className="flex-1" />
              {generation.creditsUsed ? <span className="text-[11px] text-emerald-600">消耗 {generation.creditsUsed} 积分</span> : null}
              {generation.module && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600">{generation.module}</span>}
            </div>
            <div className={`grid gap-2 ${generation.resultUrls.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
              {generation.resultUrls.map((url, i) => (
                <div key={i} className="group relative cursor-zoom-in overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm transition-shadow hover:shadow-md"
                  onClick={() => onOpenImage(url)}>
                  <img src={url} alt={`结果 ${i + 1}`} className="aspect-[3/4] w-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/10 group-hover:opacity-100">
                    <ZoomIn className="h-5 w-5 text-white drop-shadow" />
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); downloadImage(url, generateDownloadFilename("agent", i)); }}
                    className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-700 opacity-0 shadow transition-opacity hover:bg-white group-hover:opacity-100">
                    <Download className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
            {/* 快捷操作按钮 */}
            {onRepair && generation._lastRunData && (
              <RepairPromptPanel
                kind={getGenerationRepairKind(generation._lastRunData.module)}
                priorityValues={getPriorityRepairValues(generation._lastRunData.module, generation._lastRunData.taskBrief?.risks || [])}
                onRepair={(repairValue) => onRepair(message.id, repairValue)}
                className="mt-2 shadow-sm"
              />
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <QuickAction icon={<RefreshCw className="h-3 w-3" />} label="重新生成" onClick={() => onRetry(message.id)} />
              <QuickAction
                icon={<Download className="h-3 w-3" />}
                label="全部下载"
                onClick={() => generation.resultUrls.forEach((url, i) => downloadImage(url, generateDownloadFilename("agent", i)))}
              />
              <QuickAction
                icon={<Sparkles className="h-3 w-3" />}
                label="再来一张"
                variant="primary"
                onClick={() => onRetry(message.id)}
              />
              {generation.resultUrls[0] && onUseAsReference && (
                <QuickAction
                  icon={<ZoomIn className="h-3 w-3" />}
                  label="用作参考图"
                  onClick={() => onUseAsReference(generation.resultUrls[0])}
                />
              )}
            </div>
          </div>
        )}

        {/* 生成失败 */}
        {generation && generation.status === "failed" && (
          <div className="mt-1.5 w-full max-w-sm overflow-hidden rounded-xl border border-red-200 bg-gradient-to-br from-white to-red-50/50">
            <div className="px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-red-100">
                  <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-red-700">生成失败</p>
                  <p className="truncate text-[10px] text-red-500">{generation.error || "未知错误"}</p>
                </div>
              </div>
              <div className="mt-2 rounded-lg border border-red-100 bg-white/80 px-2.5 py-2 text-[11px] leading-relaxed text-slate-600">
                <p>不会自动再次扣费；点击重新生成会重新进入确认流程。</p>
                <p className="text-slate-400">如果已进入第三方生成队列，积分以服务端记录为准。</p>
              </div>
              <FailureCreditNotice generation={generation} />
              <button onClick={() => onRetry(message.id)}
                className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-red-50 py-2 text-xs font-bold text-red-600 transition-colors hover:bg-red-100">
                <RefreshCw className="h-3 w-3" /> 重新生成
              </button>
            </div>
          </div>
        )}

        {/* 分组消息的时间（仅最后一条显示） */}
        {isGrouped && (
          <span className="mt-0.5 text-[10px] text-slate-300 opacity-0 transition-opacity group-hover:opacity-100">
            {formatTimeShort(created_at)}
          </span>
        )}
      </div>
    </motion.div>
  );
}

function WorkflowExecutionCard({
  payload,
  onConfirm,
  onCancel,
  onRetryStep,
  onSkipStep,
  onSelectImage,
  onEditStep,
  onOpenImage,
}: {
  payload: WorkflowClientPayload;
  onConfirm?: () => void;
  onCancel?: () => void;
  onRetryStep?: (stepId: string) => void;
  onSkipStep?: (stepId: string) => void;
  onSelectImage?: (stepId: string, selectedImageUrl: string) => void;
  onEditStep?: (stepId: string, patch: { title?: string; params?: Record<string, unknown>; input?: Record<string, unknown> }) => void;
  onOpenImage: (url: string) => void;
}) {
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const { workflow, steps } = payload;
  const status = workflow.status;
  const finalUrls = getWorkflowImageUrls(payload);
  const totalCredits = payload.costEstimate?.total || workflow.cost_estimate?.total || 0;
  const canConfirm = status === "needs_confirmation" || status === "planned";
  const isActive = ["confirmed", "queued", "running"].includes(status);
  const isTerminal = ["completed", "partially_completed", "failed", "cancelled"].includes(status);
  const canCancel = !isTerminal;

  return (
    <div className="mt-2 w-full max-w-xl overflow-hidden rounded-2xl border border-violet-100 bg-white/95 shadow-sm">
      <div className="border-b border-violet-50 bg-gradient-to-r from-violet-50 to-white px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm shadow-violet-100">
            {isActive ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-bold text-slate-800">智能视觉工作流</p>
              <WorkflowStatusBadge status={status} />
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              {workflow.summary || workflow.intent || "按你的指令自动规划、执行和检查结果。"}
            </p>
          </div>
          {totalCredits > 0 && (
            <div className="rounded-lg bg-white px-3 py-1.5 text-center ring-1 ring-violet-100">
              <p className="text-base font-black text-violet-700">{totalCredits}</p>
              <p className="text-[10px] font-semibold text-violet-400">积分</p>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-3 p-4">
        {steps.length > 0 && (
          <WorkflowPlanPanel
            payload={payload}
            isActive={isActive}
            editingStepId={editingStepId}
            onToggleEdit={(stepId) => setEditingStepId((current) => current === stepId ? null : stepId)}
            onCancelEdit={() => setEditingStepId(null)}
            onRetryStep={onRetryStep}
            onSkipStep={onSkipStep}
            onSelectImage={onSelectImage}
            onEditStep={onEditStep}
            onOpenImage={onOpenImage}
          />
        )}

        {finalUrls.length > 0 && (
          <div className={`grid gap-2 ${finalUrls.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
            {finalUrls.map((url, index) => (
              <button
                key={`${url}-${index}`}
                type="button"
                onClick={() => onOpenImage(url)}
                className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm transition-shadow hover:shadow-md"
              >
                <img
                  src={url}
                  alt={`workflow 结果 ${index + 1}`}
                  className={finalUrls.length === 1 ? "max-h-[520px] w-full object-contain" : "aspect-[3/4] w-full object-cover"}
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/10 group-hover:opacity-100">
                  <ZoomIn className="h-5 w-5 text-white drop-shadow" />
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {canConfirm && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={!onConfirm}
              className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold text-white shadow-sm shadow-violet-100 transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Sparkles className="h-3.5 w-3.5" />
              确认并开始
            </button>
          )}
          {canCancel && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            >
              取消
            </button>
          )}
          {isActive && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1.5 text-xs font-bold text-violet-700">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              正在执行
            </span>
          )}
          {isTerminal && workflow.error_message && (
            <span className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600">
              {workflow.error_message}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function WorkflowPlanPanel({
  payload,
  isActive,
  editingStepId,
  onToggleEdit,
  onCancelEdit,
  onRetryStep,
  onSkipStep,
  onSelectImage,
  onEditStep,
  onOpenImage,
}: {
  payload: WorkflowClientPayload;
  isActive: boolean;
  editingStepId: string | null;
  onToggleEdit: (stepId: string) => void;
  onCancelEdit: () => void;
  onRetryStep?: (stepId: string) => void;
  onSkipStep?: (stepId: string) => void;
  onSelectImage?: (stepId: string, selectedImageUrl: string) => void;
  onEditStep?: (stepId: string, patch: { title?: string; params?: Record<string, unknown>; input?: Record<string, unknown> }) => void;
  onOpenImage: (url: string) => void;
}) {
  const { steps, workflow } = payload;
  const [open, setOpen] = useState(true);
  const [expandedStepIds, setExpandedStepIds] = useState<string[]>(() =>
    steps
      .filter((step) => ["running", "failed", "waiting_user"].includes(step.status))
      .map((step) => step.id)
  );
  const running = steps.some((step) => ["running", "queued"].includes(step.status)) || ["confirmed", "queued", "running"].includes(workflow.status);
  const completedCount = steps.filter((step) => ["completed", "skipped"].includes(step.status)).length;
  const failedCount = steps.filter((step) => step.status === "failed").length;
  const importantStepIds = steps
    .filter((step) => ["running", "failed", "waiting_user"].includes(step.status))
    .map((step) => step.id)
    .join("|");

  useEffect(() => {
    if (!importantStepIds) return;
    const ids = importantStepIds.split("|").filter(Boolean);
    setExpandedStepIds((current) => Array.from(new Set([...current, ...ids])));
  }, [importantStepIds]);

  const toggleStep = (stepId: string) => {
    setExpandedStepIds((current) =>
      current.includes(stepId) ? current.filter((id) => id !== stepId) : [...current, stepId]
    );
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-slate-50"
      >
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          running ? "bg-slate-900 text-white" : failedCount > 0 ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
        }`}>
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : failedCount > 0 ? <AlertCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-800">任务规划</p>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
              {steps.length} 步
            </span>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-slate-500">
            {getWorkflowPlanPanelSummary(workflow.status, completedCount, steps.length, failedCount)}
          </p>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-slate-100 px-3.5 py-3">
          <div className="space-y-1">
            {steps.map((step, index) => {
              const expanded = expandedStepIds.includes(step.id) || editingStepId === step.id;
              return (
                <WorkflowPlanStep
                  key={step.id}
                  payload={payload}
                  step={step}
                  index={index}
                  expanded={expanded}
                  isActive={isActive}
                  editing={editingStepId === step.id}
                  onToggle={() => toggleStep(step.id)}
                  onToggleEdit={() => onToggleEdit(step.id)}
                  onCancelEdit={onCancelEdit}
                  onRetryStep={onRetryStep}
                  onSkipStep={onSkipStep}
                  onSelectImage={onSelectImage}
                  onEditStep={onEditStep}
                  onOpenImage={onOpenImage}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function WorkflowPlanStep({
  payload,
  step,
  index,
  expanded,
  isActive,
  editing,
  onToggle,
  onToggleEdit,
  onCancelEdit,
  onRetryStep,
  onSkipStep,
  onSelectImage,
  onEditStep,
  onOpenImage,
}: {
  payload: WorkflowClientPayload;
  step: WorkflowStepRecord;
  index: number;
  expanded: boolean;
  isActive: boolean;
  editing: boolean;
  onToggle: () => void;
  onToggleEdit: () => void;
  onCancelEdit: () => void;
  onRetryStep?: (stepId: string) => void;
  onSkipStep?: (stepId: string) => void;
  onSelectImage?: (stepId: string, selectedImageUrl: string) => void;
  onEditStep?: (stepId: string, patch: { title?: string; params?: Record<string, unknown>; input?: Record<string, unknown> }) => void;
  onOpenImage: (url: string) => void;
}) {
  return (
    <div className="relative pl-7">
      {index < payload.steps.length - 1 && (
        <div className="absolute left-[11px] top-7 h-[calc(100%-14px)] w-px bg-slate-200" />
      )}
      <button
        type="button"
        onClick={onToggle}
        className="group flex w-full items-start gap-2 rounded-xl px-1.5 py-2 text-left transition-colors hover:bg-slate-50"
      >
        <div className={`absolute left-0 top-2.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ring-4 ring-white ${getWorkflowStepNodeTone(step.status)}`}>
          {getWorkflowStepNodeIcon(step.status, index)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-800">{step.title}</p>
            <StepStatusPill status={step.status} />
          </div>
          <p className="mt-0.5 truncate text-[11px] text-slate-500">
            {getWorkflowToolLabel(step.type)}
            {step.error_message ? `：${step.error_message}` : ""}
          </p>
        </div>
        <ChevronDown className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300 transition-transform group-hover:text-slate-500 ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="ml-1.5 rounded-xl border border-slate-100 bg-slate-50/70 p-2.5">
          <StepImageSelector
            step={step}
            images={getSelectableImagesForStep(payload, index)}
            onOpenImage={onOpenImage}
            onSelectImage={canSelectWorkflowStepImage(step) ? onSelectImage : undefined}
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {!isActive && canEditWorkflowStep(step.status) && onEditStep && (
              <button
                type="button"
                onClick={onToggleEdit}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600 transition-colors hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
              >
                <Pencil className="h-3 w-3" />
                编辑
              </button>
            )}
            {!isActive && step.status === "failed" && onRetryStep && (
              <button
                type="button"
                onClick={() => onRetryStep(step.id)}
                className="inline-flex items-center gap-1 rounded-lg border border-violet-100 bg-white px-2 py-1 text-[10px] font-bold text-violet-700 transition-colors hover:bg-violet-50"
              >
                <RefreshCw className="h-3 w-3" />
                重试
              </button>
            )}
            {!isActive && !["completed", "running", "cancelled", "skipped"].includes(step.status) && onSkipStep && (
              <button
                type="button"
                onClick={() => onSkipStep(step.id)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-500 transition-colors hover:bg-slate-50"
              >
                跳过
              </button>
            )}
          </div>
          {editing && onEditStep && (
            <WorkflowStepEditor
              step={step}
              onCancel={onCancelEdit}
              onSave={(patch) => {
                onCancelEdit();
                onEditStep(step.id, patch);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function StepImageSelector({
  step,
  images,
  onOpenImage,
  onSelectImage,
}: {
  step: WorkflowStepRecord;
  images: string[];
  onOpenImage: (url: string) => void;
  onSelectImage?: (stepId: string, selectedImageUrl: string) => void;
}) {
  const uniqueImages = Array.from(new Set(images)).filter(Boolean);
  const selected = step.output?.selectedImageUrl;
  if (uniqueImages.length <= 1 && !selected) return null;

  return (
    <div className="mt-2 rounded-lg border border-slate-100 bg-white/80 p-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold text-slate-500">候选结果</span>
        {selected && <span className="text-[10px] font-bold text-emerald-600">已选择 1 张继续</span>}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {uniqueImages.map((url, index) => {
          const isSelected = selected === url;
          return (
            <div key={`${step.id}-${url}`} className={`overflow-hidden rounded-lg border bg-slate-50 ${isSelected ? "border-emerald-300 ring-2 ring-emerald-100" : "border-slate-200"}`}>
              <button
                type="button"
                onClick={() => onOpenImage(url)}
                className="group relative block aspect-[3/4] w-full overflow-hidden bg-white"
              >
                <img src={url} alt={`候选结果 ${index + 1}`} className="h-full w-full object-cover" />
                <span className="absolute left-1 top-1 rounded bg-black/45 px-1.5 py-0.5 text-[9px] font-bold text-white">
                  {index + 1}
                </span>
                <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all group-hover:bg-black/10 group-hover:opacity-100">
                  <ZoomIn className="h-4 w-4 text-white drop-shadow" />
                </span>
              </button>
              {onSelectImage && (
                <button
                  type="button"
                  onClick={() => onSelectImage(step.id, url)}
                  disabled={isSelected || step.status === "running"}
                  className={`flex w-full items-center justify-center gap-1 px-1.5 py-1.5 text-[10px] font-bold transition-colors ${
                    isSelected
                      ? "cursor-default bg-emerald-50 text-emerald-600"
                      : "bg-white text-violet-700 hover:bg-violet-50 disabled:cursor-not-allowed disabled:text-slate-300"
                  }`}
                >
                  {isSelected ? <CheckCircle2 className="h-3 w-3" /> : <Check className="h-3 w-3" />}
                  {isSelected ? "已选" : "选这张继续"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WorkflowStepEditor({
  step,
  onCancel,
  onSave,
}: {
  step: WorkflowStepRecord;
  onCancel: () => void;
  onSave: (patch: { title?: string; params?: Record<string, unknown>; input?: Record<string, unknown> }) => void;
}) {
  const editable = readWorkflowStepParams(step.params);
  const [title, setTitle] = useState(step.title || "");
  const [prompt, setPrompt] = useState(editable.prompt || "");
  const [model, setModel] = useState<LearnedWorkflowModel>(editable.model);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(editable.aspectRatio);
  const [imageSize, setImageSize] = useState<ImageSize>(editable.imageSize);
  const [count, setCount] = useState(String(editable.count));

  const handleSave = () => {
    const nextCount = Math.min(Math.max(Number(count) || 1, 1), 4);
    onSave({
      title: title.trim() || step.title,
      params: {
        prompt,
        model,
        aiModel: model,
        aspectRatio,
        aspect_ratio: aspectRatio,
        imageSize,
        image_size: imageSize,
        count: nextCount,
        gen_count: nextCount,
      },
    });
  };

  return (
    <div className="mt-2 rounded-xl border border-violet-100 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-slate-700">编辑步骤</p>
        <button
          type="button"
          onClick={onCancel}
          className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          title="关闭编辑"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <label className="mb-2 block">
        <span className="mb-1 block text-[10px] font-bold text-slate-400">步骤标题</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none transition-colors focus:border-violet-300"
        />
      </label>

      <div className="mb-2 grid grid-cols-2 gap-2">
        <ConfirmSelect
          label="模型"
          value={model}
          options={CONFIRM_MODEL_OPTIONS}
          onChange={(value) => setModel(value as LearnedWorkflowModel)}
        />
        <ConfirmSelect
          label="比例"
          value={aspectRatio}
          options={CONFIRM_RATIO_OPTIONS}
          onChange={(value) => setAspectRatio(value as AspectRatio)}
        />
        <ConfirmSelect
          label="分辨率"
          value={imageSize}
          options={CONFIRM_SIZE_OPTIONS}
          onChange={(value) => setImageSize(value as ImageSize)}
        />
        <label className="min-w-0">
          <span className="mb-1 block text-[10px] font-bold text-slate-400">数量</span>
          <input
            type="number"
            min={1}
            max={4}
            value={count}
            onChange={(event) => setCount(event.target.value)}
            className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none transition-colors focus:border-violet-300"
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-[10px] font-bold text-slate-400">最终提示词</span>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          className="min-h-24 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-relaxed text-slate-700 outline-none transition-colors focus:border-violet-300"
          placeholder="修改这一步真正要发给模型的提示词"
        />
      </label>

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleSave}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-violet-700"
        >
          <Check className="h-3.5 w-3.5" />
          保存并重新排队
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-500 transition-colors hover:bg-slate-50"
        >
          取消
        </button>
      </div>
    </div>
  );
}

type LearnedWorkflowModel = LingyaModel;

function getSelectableImagesForStep(payload: WorkflowClientPayload, stepIndex: number) {
  const step = payload.steps[stepIndex];
  const direct = Array.isArray(step.output?.imageUrls) ? step.output.imageUrls : [];
  if (direct.length > 0) return direct;

  if (step.type === "select_image" || step.status === "waiting_user") {
    for (let i = stepIndex - 1; i >= 0; i--) {
      const urls = payload.steps[i].output?.imageUrls || [];
      if (urls.length > 0) return urls;
    }
  }

  return [];
}

function canEditWorkflowStep(status: string) {
  return ["pending", "ready", "failed", "completed", "skipped", "waiting_user"].includes(status);
}

function canSelectWorkflowStepImage(step: WorkflowStepRecord) {
  return step.type === "select_image" || step.status === "waiting_user" || Boolean(step.output?.selectedImageUrl);
}

function readWorkflowStepParams(params: Record<string, unknown>) {
  const model = String(params.model || params.aiModel || params.ai_model || "gpt-image-2") as LingyaModel;
  const aspectRatio = String(params.aspectRatio || params.aspect_ratio || "3:4") as AspectRatio;
  const imageSize = String(params.imageSize || params.image_size || "1K") as ImageSize;
  const count = Math.min(Math.max(Number(params.count || params.genCount || params.gen_count || 1), 1), 4);
  const prompt = typeof params.prompt === "string" ? params.prompt : "";
  return { model, aspectRatio, imageSize, count, prompt };
}

function WorkflowStatusBadge({ status }: { status: WorkflowStatus | string }) {
  const tone = getWorkflowStatusTone(status);
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${tone}`}>
      {getWorkflowStatusLabel(status)}
    </span>
  );
}

function getWorkflowPlanPanelSummary(status: WorkflowStatus | string, completedCount: number, totalCount: number, failedCount: number) {
  if (failedCount > 0) return `${completedCount}/${totalCount} 已完成，${failedCount} 个步骤需要处理`;
  if (status === "needs_confirmation" || status === "planned" || status === "draft") return "已拆解执行步骤，确认前不会扣费";
  if (status === "confirmed" || status === "queued") return "计划已确认，正在等待执行";
  if (status === "running") return `${completedCount}/${totalCount} 已完成，剩余步骤处理中`;
  if (status === "completed") return "所有步骤已完成";
  if (status === "partially_completed") return `${completedCount}/${totalCount} 已完成，可查看结果`;
  if (status === "cancelled") return "计划已取消";
  return `${completedCount}/${totalCount} 已完成`;
}

function getWorkflowStepNodeTone(status: string) {
  if (status === "completed") return "bg-emerald-500 text-white";
  if (status === "failed") return "bg-red-500 text-white";
  if (status === "running" || status === "queued") return "bg-slate-900 text-white";
  if (status === "waiting_user") return "bg-amber-500 text-white";
  if (status === "skipped" || status === "cancelled") return "bg-slate-300 text-white";
  return "bg-white text-slate-500 ring-slate-100";
}

function getWorkflowStepNodeIcon(status: string, index: number) {
  if (status === "completed") return <Check className="h-3 w-3" />;
  if (status === "failed") return <X className="h-3 w-3" />;
  if (status === "running" || status === "queued") return <Loader2 className="h-3 w-3 animate-spin" />;
  return index + 1;
}

function StepStatusPill({ status }: { status: string }) {
  const done = status === "completed";
  const failed = status === "failed";
  const running = status === "running" || status === "queued";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
      done
        ? "bg-emerald-50 text-emerald-600"
        : failed
          ? "bg-red-50 text-red-600"
          : running
            ? "bg-violet-50 text-violet-600"
            : "bg-slate-100 text-slate-500"
    }`}>
      {done ? <CheckCircle2 className="h-3 w-3" /> : failed ? <AlertCircle className="h-3 w-3" /> : running ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
      {getStepStatusLabel(status)}
    </span>
  );
}

type AgentTraceApiRecord = {
  id: string;
  action?: string;
  module?: string | null;
  confidence?: number;
  source?: string;
  trace?: {
    latencyMs?: number;
    events?: Array<{
      stage: string;
      status: string;
      summary: string;
      latencyMs?: number;
    }>;
    final?: {
      action: string;
      module: string | null;
      confidence: number;
      source: string;
    };
  };
};

function AgentTracePanel({ traceId }: { traceId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [record, setRecord] = useState<AgentTraceApiRecord | null>(null);

  useEffect(() => {
    if (!open || record || loading) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/agent/brain-traces/${traceId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setRecord(data.trace || null);
      })
      .catch(() => {
        if (!cancelled) setRecord(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, record, loading, traceId]);

  const events = record?.trace?.events || [];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
        title="查看 Agent 理解和执行过程"
      >
        <Activity className="h-3 w-3" />
        过程
      </button>
      {open && (
        <div className="absolute left-0 top-7 z-20 w-72 rounded-lg border border-slate-200 bg-white p-3 text-left shadow-xl">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-800">Agent 过程</span>
            <span className="text-[10px] text-slate-400">{record?.trace?.latencyMs ? `${record.trace.latencyMs}ms` : ""}</span>
          </div>
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              读取中...
            </div>
          ) : events.length ? (
            <div className="space-y-2">
              {events.slice(0, 8).map((event, index) => (
                <div key={`${event.stage}-${index}`} className="rounded-md bg-slate-50 p-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] font-bold text-slate-700">{formatTraceStage(event.stage)}</span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${getTraceStatusTone(event.status)}`}>{event.status}</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-4 text-slate-500">{event.summary}</p>
                </div>
              ))}
              {record?.trace?.final && (
                <div className="rounded-md bg-violet-50 p-2 text-[11px] text-violet-700">
                  最终：{record.trace.final.action} / {record.trace.final.module || "none"} / {Math.round(record.trace.final.confidence * 100)}%
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-500">暂无 trace 数据。</p>
          )}
        </div>
      )}
    </div>
  );
}

type RuntimeTimelineItem = {
  label: string;
  status: "pending" | "running" | "done" | string;
  detail?: string;
};

function AgentRuntimeTimeline({ timeline, compact = false }: { timeline: RuntimeTimelineItem[]; compact?: boolean }) {
  const activeItem = timeline.find((item) => item.status === "running");
  const done = timeline.length > 0 && timeline.every((item) => item.status === "done");
  const hasRunning = Boolean(activeItem);
  const [open, setOpen] = useState(() => !compact && hasRunning);
  useEffect(() => {
    if (hasRunning) setOpen(true);
  }, [hasRunning]);
  if (!timeline.length) return null;
  const title = activeItem ? "正在规划任务" : done ? "已完成规划" : "规划任务";
  const summary = activeItem?.detail || timeline[timeline.length - 1]?.detail || "Agent 正在处理。";

  return (
    <div className={`${compact ? "mb-2 rounded-xl border border-slate-100 bg-slate-50/80" : "w-full max-w-md rounded-2xl rounded-bl-md border border-slate-200 bg-white/95 shadow-sm"} overflow-hidden`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-slate-50"
      >
        <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
          activeItem ? "bg-slate-900 text-white" : done ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"
        }`}>
          {activeItem ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Activity className="h-3.5 w-3.5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-800">{title}</p>
          <p className="mt-0.5 truncate text-[11px] text-slate-500">{summary}</p>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-slate-100 px-3 pb-3 pt-2">
          <div className="space-y-2">
            {timeline.map((item, index) => (
              <div key={`${item.label}-${index}`} className="flex gap-2">
                <div className="flex w-5 shrink-0 flex-col items-center">
                  <div className={`flex h-5 w-5 items-center justify-center rounded-full ${getRuntimeTimelineNodeTone(item.status)}`}>
                    {item.status === "running" ? <Loader2 className="h-3 w-3 animate-spin" /> : item.status === "done" ? <Check className="h-3 w-3" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
                  </div>
                  {index < timeline.length - 1 && <div className="mt-1 h-5 w-px bg-slate-200" />}
                </div>
                <div className="min-w-0 flex-1 pb-1">
                  <p className="text-[11px] font-semibold text-slate-700">{item.label}</p>
                  {item.detail && <p className="mt-0.5 text-[11px] leading-4 text-slate-500">{item.detail}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function getWorkflowPayload(params: Record<string, unknown>): WorkflowClientPayload | null {
  const raw = params?.workflow;
  if (!isPlainObject(raw) || !isPlainObject(raw.workflow)) return null;
  return {
    workflow: raw.workflow as WorkflowRecord,
    steps: Array.isArray(raw.steps) ? raw.steps as WorkflowStepRecord[] : [],
    events: Array.isArray(raw.events) ? raw.events as WorkflowEventRecord[] : [],
    assets: Array.isArray(raw.assets) ? raw.assets as WorkflowAssetRecord[] : [],
    costEstimate: isPlainObject(raw.costEstimate) ? raw.costEstimate as WorkflowCostEstimate : undefined,
  };
}

function readAgentTimeline(params: Record<string, unknown> | undefined): RuntimeTimelineItem[] {
  if (!Array.isArray(params?.agentTimeline)) return [];
  return params.agentTimeline
    .filter(isPlainObject)
    .map((item) => ({
      label: typeof item.label === "string" ? item.label : "",
      status: typeof item.status === "string" ? item.status : "pending",
      detail: typeof item.detail === "string" ? item.detail : undefined,
    }))
    .filter((item) => item.label);
}

function normalizeAgentTimelineForMessage(
  timeline: RuntimeTimelineItem[],
  workflowPayload: WorkflowClientPayload | null,
  generation: Message["generation"] | null | undefined
): RuntimeTimelineItem[] {
  if (timeline.length === 0) return timeline;

  const workflowStatus = workflowPayload?.workflow?.status;
  if (workflowStatus && shouldCompleteTimelineForWorkflowStatus(workflowStatus)) {
    return completeRuntimeTimeline(timeline, getWorkflowTimelineDoneDetail(workflowStatus));
  }

  if (generation?.status === "pending") {
    return completeRuntimeTimeline(timeline, "已生成确认卡，等待确认后执行。");
  }
  if (generation?.status === "completed") {
    return completeRuntimeTimeline(timeline, "生成已完成。");
  }
  if (generation?.status === "failed") {
    return completeRuntimeTimeline(timeline, "生成已结束，可根据错误信息重试或修复。");
  }

  return timeline;
}

function shouldCompleteTimelineForWorkflowStatus(status: string) {
  return ["draft", "planned", "needs_confirmation", "confirmed", "waiting_user", "queued", "completed", "partially_completed", "failed", "cancelled"].includes(status);
}

function getWorkflowTimelineDoneDetail(status: string) {
  if (status === "needs_confirmation" || status === "waiting_user" || status === "planned" || status === "draft") {
    return "计划已复核，正在等待你确认。";
  }
  if (status === "confirmed") return "计划已确认，等待进入执行队列。";
  if (status === "queued") return "计划已确认并入队，执行进度看下方步骤卡片。";
  if (status === "completed") return "工作流已完成。";
  if (status === "partially_completed") return "工作流已部分完成，可查看步骤结果。";
  if (status === "failed") return "工作流已结束，可查看失败步骤并重试。";
  if (status === "cancelled") return "工作流已取消。";
  return "计划已复核。";
}

function completeRuntimeTimeline(timeline: RuntimeTimelineItem[], finalDetail: string): RuntimeTimelineItem[] {
  return timeline.map((item, index) => ({
    ...item,
    status: "done",
    detail: index === timeline.length - 1 ? finalDetail : item.detail,
  }));
}

function getTraceId(params: Record<string, unknown> | undefined) {
  return typeof params?.traceId === "string" ? params.traceId : null;
}

function getRuntimeTimelineNodeTone(status: string) {
  if (status === "done") return "bg-emerald-500 text-white";
  if (status === "running") return "bg-slate-900 text-white";
  return "bg-slate-100 text-slate-400";
}

function getMessageFeedback(params: Record<string, unknown> | undefined) {
  const raw = params?.feedback;
  if (!isPlainObject(raw)) return null;
  return {
    rating: raw.rating === "good" || raw.rating === "bad" ? raw.rating : null,
    status: typeof raw.status === "string" ? raw.status : "",
  };
}

function formatTraceStage(stage: string) {
  const labels: Record<string, string> = {
    image_understanding: "图片理解",
    dynamic_tool_selector: "工具选择",
    semantic_router: "语义路由",
    deterministic_safety_guard: "安全校验",
    workflow_critic: "计划复核",
  };
  return labels[stage] || stage;
}

function getTraceStatusTone(status: string) {
  if (status === "ok") return "bg-emerald-50 text-emerald-600";
  if (status === "warn" || status === "fallback") return "bg-amber-50 text-amber-600";
  if (status === "blocked" || status === "error") return "bg-rose-50 text-rose-600";
  return "bg-slate-100 text-slate-500";
}

function getWorkflowImageUrls(payload: WorkflowClientPayload) {
  const fromWorkflow = Array.isArray(payload.workflow.final_outputs?.imageUrls)
    ? payload.workflow.final_outputs.imageUrls
    : [];
  const fromAssets = (payload.assets || [])
    .filter((asset) => asset.kind === "image" && asset.role === "final")
    .map((asset) => asset.url);
  const fromSteps = payload.steps.flatMap((step) =>
    Array.isArray(step.output?.imageUrls) ? step.output.imageUrls : []
  );
  return Array.from(new Set([...fromWorkflow, ...fromAssets, ...fromSteps])).filter(Boolean);
}

function getWorkflowStatusTone(status: WorkflowStatus | string) {
  if (status === "completed") return "bg-emerald-50 text-emerald-700 ring-emerald-100";
  if (status === "partially_completed") return "bg-amber-50 text-amber-700 ring-amber-100";
  if (status === "failed" || status === "cancelled") return "bg-red-50 text-red-700 ring-red-100";
  if (status === "running" || status === "queued" || status === "confirmed") return "bg-violet-50 text-violet-700 ring-violet-100";
  return "bg-slate-50 text-slate-600 ring-slate-100";
}

function getWorkflowStatusLabel(status: WorkflowStatus | string) {
  const labels: Record<string, string> = {
    draft: "草稿",
    planned: "待确认",
    needs_confirmation: "待确认",
    confirmed: "已确认",
    queued: "排队中",
    running: "执行中",
    waiting_user: "等待选择",
    completed: "已完成",
    partially_completed: "部分完成",
    failed: "失败",
    cancelled: "已取消",
  };
  return labels[status] || status;
}

function getStepStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "等待",
    ready: "就绪",
    queued: "排队",
    running: "执行",
    completed: "完成",
    failed: "失败",
    skipped: "跳过",
    waiting_user: "待选择",
    cancelled: "取消",
  };
  return labels[status] || status;
}

function getWorkflowToolLabel(type: string) {
  const labels: Record<string, string> = {
    text_to_image: "文生图",
    image_to_image: "图生图",
    tryon: "换装试穿",
    pose_variation: "姿势裂变",
    garment_3d: "3D 立体展示",
    commerce_detail: "电商详情页",
    commerce_creative: "商业创意图",
    background_replace: "背景替换",
    select_image: "结果选择",
    image_quality_check: "质量检查",
    prompt_repair: "提示词修复",
    image_to_video: "图生视频",
    image_to_3d_asset: "3D 资产",
  };
  return labels[type] || type;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function ConfirmImageRoleEditor({
  messageId,
  images,
  onPreview,
  onChange,
}: {
  messageId: string;
  images: ChatImage[];
  onPreview: (url: string) => void;
  onChange?: (messageId: string, imageIndex: number, role: ChatImageRole) => void;
}) {
  if (!onChange || images.length === 0) return null;

  return (
    <div className="mb-3 rounded-xl border border-violet-100 bg-white/75 p-2">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-bold text-slate-600">图片角色</span>
        <span className="text-[10px] text-slate-400">确认前可修正图1/图2关系</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {images.map((img) => {
          const url = img.hostedUrl || img.url;
          return (
            <div key={`${img.index}-${url}`} className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/70 p-1.5">
              <button
                type="button"
                onClick={() => onPreview(url)}
                className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md bg-white"
              >
                <img src={url} alt={`图${img.index}`} className="h-full w-full object-cover" />
                <span className="absolute bottom-0 left-0 right-0 bg-violet-600/85 text-center text-[8px] font-bold leading-tight text-white">
                  图{img.index}
                </span>
              </button>
              <select
                value={img.role || "auto"}
                onChange={(event) => onChange(messageId, img.index, event.target.value as ChatImageRole)}
                className="h-8 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none transition-colors focus:border-violet-300"
                title={`设置图${img.index}的图片角色`}
              >
                {CONFIRM_ROLE_OPTIONS.map((role) => (
                  <option key={role.value} value={role.value}>{role.label}</option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ConfirmRoleIssues({ issues }: { issues: ReturnType<typeof validateConfirmImageRoles> }) {
  if (issues.length === 0) return null;
  return (
    <div className="mb-3 space-y-1.5">
      {issues.map((issue, index) => (
        <div
          key={`${issue.severity}-${index}`}
          className={`rounded-lg border px-2.5 py-2 text-[11px] leading-relaxed ${
            issue.severity === "error"
              ? "border-red-200 bg-red-50 text-red-600"
              : "border-amber-200 bg-amber-50 text-amber-700"
          }`}
        >
          {issue.message}
        </div>
      ))}
    </div>
  );
}

function hasConfirmRoleErrors(module: string, params: Record<string, unknown>, images: ChatImage[]) {
  return validateConfirmImageRoles(module, params, images).some((issue) => issue.severity === "error");
}

function ConfirmExecutionSummary({
  moduleName,
  images,
  params,
  jobPayload,
  credits,
}: {
  moduleName: string;
  images: ChatImage[];
  params?: Record<string, unknown>;
  jobPayload?: Record<string, unknown>;
  credits: number;
}) {
  const usedImages = images.length > 0
    ? images.map((img) => `图${img.index}=${getRoleLabel(img.role || "auto")}`).join("，")
    : "不使用附件图，仅按文字生成";

  return (
    <div className="mb-3 rounded-xl border border-slate-200 bg-white/80 p-3 text-[11px] leading-relaxed text-slate-600">
      <p className="mb-1 font-bold text-slate-800">执行前确认</p>
      <p>我识别到本次任务是：<span className="font-bold text-violet-700">{moduleName}</span>。</p>
      <p>将使用：{usedImages}。</p>
      <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-amber-700">
        点击“确认生成”后才会扣除 {credits || 0} 积分；如果只是调整参数或图片角色，不会扣费。
      </p>
    </div>
  );
}

function ConfirmExecutionSummaryV2({
  moduleName,
  images,
  params,
  jobPayload,
  credits,
}: {
  moduleName: string;
  images: ChatImage[];
  params: Record<string, unknown>;
  jobPayload?: Record<string, unknown>;
  credits: number;
}) {
  const { used, unused } = splitUsedImages(images, params, jobPayload);
  const usedText = used.length > 0
    ? used.map((img) => `图${img.index}=${getRoleLabel(img.role || "auto")}`).join("，")
    : "不使用附件图，仅按文字生成";
  const unusedText = unused.length > 0
    ? unused.map((img) => `图${img.index}`).join("、")
    : "无";

  return (
    <div className="mb-3 rounded-xl border border-slate-200 bg-white/80 p-3 text-[11px] leading-relaxed text-slate-600">
      <p className="mb-1 font-bold text-slate-800">执行前确认</p>
      <p>我识别到本次任务是：<span className="font-bold text-violet-700">{moduleName}</span>。</p>
      <p>将使用：{usedText}。</p>
      <p>不会使用：{unusedText}。</p>
      <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-amber-700">
        点击“确认生成”后才会扣除 {credits || 0} 积分；如果只是调整参数或图片角色，不会扣费。
      </p>
    </div>
  );
}

function splitUsedImages(
  images: ChatImage[],
  params: Record<string, unknown>,
  jobPayload?: Record<string, unknown>
): { used: ChatImage[]; unused: ChatImage[] } {
  if (images.length === 0) return { used: [], unused: [] };
  const haystack = flattenStrings([params, jobPayload || {}]).join("\n");
  const used = images.filter((img) => {
    const urls = [img.url, img.hostedUrl].filter(Boolean) as string[];
    return urls.some((url) => haystack.includes(url));
  });
  if (used.length === 0) return { used: images, unused: [] };
  return {
    used,
    unused: images.filter((img) => !used.some((usedImg) => usedImg.index === img.index)),
  };
}

function flattenStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(flattenStrings);
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap(flattenStrings);
  }
  return [];
}

function ConfirmIntentBrief({
  moduleName,
  images,
  params,
  jobPayload,
  taskBrief,
}: {
  moduleName: string;
  images: ChatImage[];
  params: Record<string, unknown>;
  jobPayload?: Record<string, unknown>;
  taskBrief?: AgentTaskBrief;
}) {
  const { used, unused } = splitUsedImages(images, params, jobPayload);
  const prompt = typeof params.prompt === "string" ? params.prompt : typeof jobPayload?.prompt === "string" ? jobPayload.prompt : "";
  const brief = taskBrief || buildIntentBrief(moduleName, prompt, used, unused, params);

  return (
    <div className="mb-3 rounded-xl border border-violet-100 bg-gradient-to-br from-white to-violet-50/50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-bold text-slate-800">{"\u4efb\u52a1\u65b9\u6848"}</p>
        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-violet-600 ring-1 ring-violet-100">
          {brief.outputType}
        </span>
      </div>
      <div className="space-y-1.5 text-[11px] leading-relaxed text-slate-600">
        <p><span className="font-bold text-slate-700">{"\u76ee\u6807\uff1a"}</span>{brief.goal}</p>
        <p><span className="font-bold text-slate-700">{"\u56fe\u7247\uff1a"}</span>{brief.imageUsage}</p>
        <p><span className="font-bold text-slate-700">{"\u91cd\u70b9\uff1a"}</span>{brief.focus}</p>
        {brief.risks && brief.risks.length > 0 && (
          <div className="rounded-lg bg-rose-50 px-2 py-1 text-rose-700 ring-1 ring-rose-100">
            <p className="font-bold">{"\u98ce\u9669\u9884\u5224\uff1a"}</p>
            <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
              {brief.risks.slice(0, 3).map((risk) => (
                <li key={risk}>{risk}</li>
              ))}
            </ul>
          </div>
        )}
        {brief.preflight && brief.preflight.length > 0 && (
          <PreflightChecks checks={brief.preflight} />
        )}
        <p className="rounded-lg bg-white/80 px-2 py-1 text-amber-700 ring-1 ring-amber-100">
          <span className="font-bold">{"\u786e\u8ba4\u524d\u68c0\u67e5\uff1a"}</span>{brief.check}
        </p>
        {brief.rationale && brief.rationale.length > 0 && (
          <DecisionRationale lines={brief.rationale} />
        )}
      </div>
    </div>
  );
}

function PreflightChecks({ checks }: { checks: NonNullable<AgentTaskBrief["preflight"]> }) {
  return (
    <div className="rounded-lg bg-white/85 px-2 py-1.5 ring-1 ring-slate-100">
      <p className="mb-1 font-bold text-slate-700">{"\u751f\u6210\u524d\u81ea\u68c0"}</p>
      <div className="grid gap-1 sm:grid-cols-2">
        {checks.slice(0, 5).map((check) => (
          <div key={`${check.label}-${check.detail}`} className="flex min-w-0 items-start gap-1.5 rounded-md bg-slate-50 px-2 py-1">
            {check.status === "pass" ? (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
            ) : (
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
            )}
            <p className="min-w-0 text-[10px] leading-4 text-slate-500">
              <span className="font-bold text-slate-700">{check.label}</span>
              {"\uff1a"}
              {check.detail}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DecisionRationale({ lines }: { lines: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-lg border border-slate-100 bg-white/80">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-[11px] font-bold text-slate-500 transition-colors hover:bg-slate-50"
      >
        <span>{"\u51b3\u7b56\u4f9d\u636e"}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className="space-y-1 border-t border-slate-100 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
          {lines.slice(0, 5).map((line) => (
            <li key={line} className="list-disc">{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function buildIntentBrief(
  moduleName: string,
  prompt: string,
  used: ChatImage[],
  unused: ChatImage[],
  params: Record<string, unknown>
) {
  const lower = `${moduleName}\n${prompt}`.toLowerCase();
  const count = Number(params.count || params.gen_count || 1);
  const outputType = getBriefOutputType(moduleName, lower, count);
  const goal = getBriefGoal(moduleName, lower);
  const imageUsage = used.length > 0
    ? used.map((img) => `\u56fe${img.index}\u4f5c\u4e3a${getRoleLabel(img.role || "auto")}`).join("\uff1b")
    : "\u4e0d\u4f7f\u7528\u53c2\u8003\u56fe\uff0c\u6309\u6587\u5b57\u76f4\u63a5\u751f\u6210";
  const unusedText = unused.length > 0 ? `\uff1b\u4e0d\u7528${unused.map((img) => `\u56fe${img.index}`).join("\u3001")}` : "";

  return {
    outputType,
    goal,
    imageUsage: `${imageUsage}${unusedText}`,
    focus: getBriefFocus(moduleName, lower),
    check: getBriefCheck(moduleName, lower),
    risks: getBriefRisks(moduleName, lower, used, params),
    rationale: [],
    preflight: [],
  };
}

function getBriefOutputType(moduleName: string, lower: string, count: number) {
  if (lower.includes("\u8be6\u60c5\u9875")) return "\u7535\u5546\u8be6\u60c5";
  if (lower.includes("banner")) return "Banner";
  if (lower.includes("\u4e3b\u56fe")) return "\u7535\u5546\u4e3b\u56fe";
  if (lower.includes("\u56db\u5bab\u683c")) return "\u56db\u5bab\u683c";
  if (count > 1) return `${count} \u5f20\u56fe`;
  return moduleName;
}

function getBriefGoal(moduleName: string, lower: string) {
  if (lower.includes("\u8be6\u60c5\u9875")) return "\u751f\u6210\u53ef\u7528\u4e8e\u6dd8\u5b9d/\u5929\u732b/\u4eac\u4e1c\u7684\u5546\u54c1\u8be6\u60c5\u9875\uff0c\u4e0d\u662f\u79cd\u8349\u6216\u8857\u62cd\u56fe\u3002";
  if (lower.includes("banner")) return "\u751f\u6210\u6a2a\u7248\u5546\u4e1a banner\uff0c\u517c\u987e\u4e3b\u4f53\u3001\u6807\u9898\u548c\u5356\u70b9\u5c42\u7ea7\u3002";
  if (lower.includes("\u4e3b\u56fe")) return "\u751f\u6210\u7535\u5546\u4e3b\u56fe\uff0c\u4e3b\u4f53\u6e05\u695a\uff0c\u5356\u70b9\u76f4\u89c2\u3002";
  if (moduleName.includes("姿") || lower.includes("pose")) return "\u57fa\u4e8e\u4e3b\u56fe\u505a\u59ff\u52bf\u53d8\u5316\uff0c\u4fdd\u6301\u4eba\u7269\u548c\u670d\u88c5\u7a33\u5b9a\u3002";
  if (moduleName.toLowerCase().includes("grass")) return "\u751f\u6210\u670d\u88c5\u79cd\u8349\u89c6\u89c9\uff0c\u4fdd\u6301\u670d\u88c5\u8fd8\u539f\u548c\u751f\u6d3b\u6c1b\u56f4\u3002";
  return "\u6309\u7528\u6237\u539f\u59cb\u8981\u6c42\u751f\u6210\u56fe\u50cf\uff0c\u53c2\u8003\u56fe\u53ea\u670d\u52a1\u4e8e\u8fd9\u4e2a\u76ee\u6807\u3002";
}

function getBriefFocus(moduleName: string, lower: string) {
  if (lower.includes("\u8be6\u60c5\u9875")) return "\u7248\u5f0f\u5206\u533a\u3001\u5546\u54c1\u4e3b\u4f53\u3001\u5356\u70b9\u6587\u6848\u3001\u7ec6\u8282/\u53c2\u6570\u5c42\u7ea7\u3002";
  if (moduleName.includes("姿") || lower.includes("pose")) return "\u4eba\u7269\u6bd4\u4f8b\u3001\u8138\u90e8\u4e00\u81f4\u3001\u670d\u88c5\u4e00\u81f4\u3001\u771f\u5b9e\u5173\u8282\u52a8\u4f5c\u3002";
  if (moduleName.toLowerCase().includes("tryon")) return "\u670d\u88c5\u8fd8\u539f\u3001\u7a7f\u7740\u5408\u8eab\u3001\u4eba\u8138\u8eab\u4efd\u3001\u81ea\u7136\u4f53\u6001\u3002";
  return "\u4e3b\u4f53\u4e0d\u8dd1\u504f\u3001\u98ce\u683c\u4e0d\u786c\u5957\u3001\u753b\u9762\u670d\u52a1\u4e8e\u6700\u7ec8\u7528\u9014\u3002";
}

function getBriefCheck(moduleName: string, lower: string) {
  if (lower.includes("\u8be6\u60c5\u9875")) return "\u5982\u679c\u8fd9\u91cc\u88ab\u8bc6\u522b\u6210\u79cd\u8349/\u8857\u62cd\uff0c\u5148\u6539\u6700\u7ec8\u63d0\u793a\u8bcd\u518d\u751f\u6210\u3002";
  if (moduleName.includes("姿") || lower.includes("pose")) return "\u5982\u679c\u9700\u8981\u6bcf\u4e2a\u59ff\u52bf\u5355\u72ec\u4e00\u5f20\uff0c\u5148\u5728\u6700\u7ec8\u63d0\u793a\u8bcd\u91cc\u5199\u660e\u3002";
  return "\u786e\u8ba4\u76ee\u6807\u3001\u56fe\u7247\u89d2\u8272\u548c\u6bd4\u4f8b\u6ca1\u95ee\u9898\u540e\u518d\u6263\u5206\u751f\u6210\u3002";
}

function getBriefRisks(moduleName: string, lower: string, used: ChatImage[], params: Record<string, unknown>): string[] {
  const risks: string[] = [];
  const count = Number(params.count || params.gen_count || 1);
  if (lower.includes("\u8be6\u60c5\u9875")) {
    risks.push("\u751f\u56fe\u6a21\u578b\u53ef\u80fd\u628a\u8be6\u60c5\u9875\u505a\u6210\u5355\u5f20\u6c1b\u56f4\u56fe\uff0c\u9700\u68c0\u67e5\u7248\u5f0f\u5206\u533a\u548c\u5356\u70b9\u5c42\u7ea7\u3002");
    risks.push("\u4e2d\u6587\u5c0f\u5b57\u53ef\u80fd\u4e0d\u7a33\u5b9a\uff0c\u91cd\u8981\u6587\u6848\u5efa\u8bae\u4fdd\u6301\u77ed\u53e5\u3002");
  }
  if (moduleName.includes("姿") || lower.includes("pose")) {
    risks.push("\u59ff\u52bf\u53d8\u5316\u5bb9\u6613\u5e26\u6765\u624b\u6307\u3001\u5173\u8282\u548c\u8eab\u4f53\u6bd4\u4f8b\u6f02\u79fb\u3002");
    risks.push("\u56db\u5bab\u683c\u548c\u591a\u5f20\u72ec\u7acb\u56fe\u9700\u660e\u786e\u533a\u5206\uff0c\u5426\u5219\u6a21\u578b\u53ef\u80fd\u8f93\u51fa\u9519\u5f62\u5f0f\u3002");
  }
  if (moduleName.toLowerCase().includes("tryon")) {
    risks.push("\u6362\u88c5\u4efb\u52a1\u5bb9\u6613\u6539\u53d8\u670d\u88c5\u7ed3\u6784\u3001logo\u6216\u9762\u6599\u7ec6\u8282\u3002");
  }
  if (used.length === 0 && lower.includes("\u53c2\u8003")) {
    risks.push("\u65b9\u6848\u63d0\u5230\u53c2\u8003\u56fe\uff0c\u4f46\u5f53\u524d\u672a\u68c0\u6d4b\u5230\u4f1a\u88ab\u4f7f\u7528\u7684\u56fe\u7247\u3002");
  }
  if (count > 1) {
    risks.push("\u591a\u5f20\u56fe\u7684\u89d2\u8272\u3001\u98ce\u683c\u548c\u4e3b\u4f53\u4e00\u81f4\u6027\u53ef\u80fd\u4f1a\u6709\u6ce2\u52a8\u3002");
  }
  return Array.from(new Set(risks)).slice(0, 4);
}

function ConfirmTaskPlan({
  moduleName,
  params,
  credits,
}: {
  moduleName: string;
  params: GenerationParams;
  credits: number;
}) {
  const steps = [
    "确认参数",
    "扣除积分",
    "生成图片",
    "校验结果",
  ];

  return (
    <div className="mb-3 rounded-xl border border-violet-100 bg-white/75 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <ConfirmChip label={moduleName} />
        <ConfirmChip label={params.model} />
        <ConfirmChip label={`${params.aspectRatio} · ${params.imageSize}`} />
        <ConfirmChip label={`${params.count} 张`} />
        <ConfirmChip label={`${credits} 积分`} tone="amber" />
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {steps.map((step, index) => (
          <div key={step} className="relative rounded-lg bg-slate-50 px-2 py-2 text-center">
            {index < steps.length - 1 && (
              <div className="absolute left-[calc(50%+12px)] top-4 hidden h-px w-[calc(100%-20px)] bg-violet-100 sm:block" />
            )}
            <div className="relative z-10 mx-auto mb-1 flex h-5 w-5 items-center justify-center rounded-full bg-violet-100 text-[10px] font-black text-violet-600">
              {index + 1}
            </div>
            <p className="relative z-10 text-[10px] font-semibold text-slate-500">{step}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConfirmTaskPlanV2({
  moduleName,
  params,
  credits,
}: {
  moduleName: string;
  params: GenerationParams;
  credits: number;
}) {
  const [open, setOpen] = useState(false);
  const steps = ["确认参数", "扣除积分", "生成图片", "校验结果"];

  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-violet-100 bg-white/75">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-violet-50/50"
      >
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-slate-800">执行计划</p>
          <p className="truncate text-[11px] text-slate-400">
            {moduleName} · {params.model} · {params.aspectRatio} · {params.imageSize} · {params.count} 张 · {credits} 积分
          </p>
        </div>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-violet-50 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <ConfirmChip label={moduleName} />
            <ConfirmChip label={params.model} />
            <ConfirmChip label={`${params.aspectRatio} · ${params.imageSize}`} />
            <ConfirmChip label={`${params.count} 张`} />
            <ConfirmChip label={`${credits} 积分`} tone="amber" />
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {steps.map((step, index) => (
              <div key={step} className="relative rounded-lg bg-slate-50 px-2 py-2 text-center">
                {index < steps.length - 1 && (
                  <div className="absolute left-[calc(50%+12px)] top-4 hidden h-px w-[calc(100%-20px)] bg-violet-100 sm:block" />
                )}
                <div className="relative z-10 mx-auto mb-1 flex h-5 w-5 items-center justify-center rounded-full bg-violet-100 text-[10px] font-black text-violet-600">
                  {index + 1}
                </div>
                <p className="relative z-10 text-[10px] font-semibold text-slate-500">{step}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 rounded-lg bg-slate-50 px-2 py-1.5 text-[11px] leading-relaxed text-slate-500">
            失败后系统不会自动再次发起扣费；如果服务端判定任务已失败且符合退款条件，会通过积分事务退回。
          </p>
        </div>
      )}
    </div>
  );
}

function FailureCreditNotice({ generation }: { generation: NonNullable<Message["generation"]> }) {
  const hasServerJob = Boolean(generation.generationId);
  const credits = generation.creditsUsed || 0;

  return (
    <div className="mt-2 rounded-lg border border-red-100 bg-white/85 px-2.5 py-2 text-[11px] leading-relaxed text-slate-600">
      <p className="font-bold text-slate-700">积分状态</p>
      {hasServerJob ? (
        <p>
          本任务已创建服务端记录。失败后服务端会调用退款事务，符合条件时退回
          <span className="font-bold text-red-600"> {credits} </span>
          积分；最终以余额和积分日志为准。
        </p>
      ) : (
        <p>
          本任务在正式创建生成记录前失败，通常不会产生扣费；重新生成会重新进入确认流程。
        </p>
      )}
    </div>
  );
}

function isAmbiguousClarifyMessage(content: string): boolean {
  return content.includes("\u6307\u4ee4\u8fd8\u6709\u70b9\u6a21\u7cca")
    || content.includes("\u8bf7\u76f4\u63a5\u56de\u590d\u4e00\u4e2a\u66f4\u660e\u786e\u7684\u65b9\u5411");
}

function ClarifyQuickReplies({ onSelect }: { onSelect: (text: string) => void }) {
  const replies = [
    "\u6309\u8fd9\u5f20\u56fe\u91cd\u65b0\u8bbe\u8ba1\u4e00\u5f20\u5546\u4e1a\u56fe",
    "\u751f\u6210\u6dd8\u5b9d\u8be6\u60c5\u9875",
    "\u4fdd\u7559\u4e3b\u4f53\uff0c\u53ea\u4fee\u590d\u6bd4\u4f8b/\u624b\u6307/\u6587\u5b57",
  ];

  return (
    <div className="mt-2 flex max-w-md flex-wrap gap-1.5">
      {replies.map((reply) => (
        <button
          key={reply}
          type="button"
          onClick={() => onSelect(reply)}
          className="rounded-full border border-violet-100 bg-white/90 px-3 py-1.5 text-[11px] font-semibold text-violet-700 shadow-sm transition-colors hover:border-violet-300 hover:bg-violet-50"
        >
          {reply}
        </button>
      ))}
    </div>
  );
}

function getGenerationRepairKind(module: string): RepairKind {
  if (module === "grass") return "grass";
  if (module === "pose") return "pose";
  if (module === "model") return "model";
  if (module === "garment_3d") return "garment3d";
  if (module === "model_background") return "modelBackground";
  if (module === "tryon") return "tryon";
  return "general";
}

function getPriorityRepairValues(module: string, risks: string[]): string[] {
  const text = risks.join("\n");
  const values: string[] = [];
  if (text.includes("\u8be6\u60c5\u9875") || text.includes("\u5355\u5f20\u6c1b\u56f4\u56fe") || text.includes("\u7248\u5f0f")) values.push("layout_hierarchy");
  if (text.includes("\u4e2d\u6587") || text.includes("\u5c0f\u5b57") || text.includes("\u56fe\u6807") || text.includes("\u6587\u5b57")) values.push("text_clean", "logo_text");
  if (text.includes("\u670d\u88c5") || text.includes("logo") || text.includes("\u4e3b\u4f53")) values.push(module === "general" ? "product_restore" : "garment_restore");
  if (text.includes("\u624b\u6307") || text.includes("\u5173\u8282") || text.includes("\u8eab\u4f53\u6bd4\u4f8b")) values.push("body_hands");
  if (text.includes("\u8138\u90e8") || text.includes("\u6362\u8138")) values.push("face_identity", "face_consistency");
  if (text.includes("\u591a\u5f20") || text.includes("\u4e00\u81f4")) values.push("intent_restore", "clothing_consistency", "face_consistency");
  return Array.from(new Set(values)).slice(0, 3);
}

function getRoleLabel(role: ChatImageRole): string {
  const item = CONFIRM_ROLE_OPTIONS.find((option) => option.value === role);
  return item?.label || "自动";
}

function ConfirmChip({ label, tone = "violet" }: { label: string; tone?: "violet" | "amber" }) {
  const cls = tone === "amber"
    ? "bg-amber-50 text-amber-700 ring-amber-100"
    : "bg-violet-50 text-violet-700 ring-violet-100";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${cls}`}>
      {label}
    </span>
  );
}

function ConfirmParamsEditor({
  messageId,
  params,
  onChange,
}: {
  messageId: string;
  params: GenerationParams;
  onChange?: (messageId: string, params: Partial<GenerationParams>) => void;
}) {
  if (!onChange) return null;

  return (
    <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl border border-amber-100 bg-white/70 p-2">
      <ConfirmSelect
        label="模型"
        value={params.model}
        options={CONFIRM_MODEL_OPTIONS}
        onChange={(value) => onChange(messageId, { model: value as LingyaModel })}
      />
      <ConfirmSelect
        label="比例"
        value={params.aspectRatio}
        options={CONFIRM_RATIO_OPTIONS}
        onChange={(value) => onChange(messageId, { aspectRatio: value as AspectRatio })}
      />
      <ConfirmSelect
        label="分辨率"
        value={params.imageSize}
        options={CONFIRM_SIZE_OPTIONS}
        onChange={(value) => onChange(messageId, { imageSize: value as ImageSize })}
      />
      <ConfirmSelect
        label="数量"
        value={String(params.count)}
        options={[1, 2, 3, 4].map((value) => ({ value: String(value), label: `${value} 张` }))}
        onChange={(value) => onChange(messageId, { count: Number(value) })}
      />
    </div>
  );
}

function ConfirmPromptEditor({
  messageId,
  prompt,
  onChange,
}: {
  messageId: string;
  prompt: string;
  onChange?: (messageId: string, params: Partial<GenerationParams>) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!onChange || !prompt) return null;

  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-violet-100 bg-white/75">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-violet-50/50"
      >
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-slate-800">{"\u6700\u7ec8\u6267\u884c\u63d0\u793a\u8bcd"}</p>
          <p className="truncate text-[11px] text-slate-400">{prompt}</p>
        </div>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="border-t border-violet-50 p-3">
          <textarea
            value={prompt}
            onChange={(event) => onChange(messageId, { prompt: event.target.value })}
            className="min-h-28 w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-relaxed text-slate-700 outline-none transition-colors focus:border-violet-300"
            placeholder={"\u786e\u8ba4\u524d\u53ef\u4ee5\u76f4\u63a5\u6539\u6700\u7ec8\u6267\u884c\u63d0\u793a\u8bcd"}
          />
          <p className="mt-1.5 text-[10px] leading-relaxed text-slate-400">
            {"\u8fd9\u91cc\u7684\u5185\u5bb9\u4f1a\u76f4\u63a5\u53d1\u7ed9\u751f\u56fe\u6a21\u578b\uff0c\u9002\u5408\u8865\u5145\u7248\u5f0f\u3001\u98ce\u683c\u3001\u6587\u6848\u548c\u7981\u6b62\u65b9\u5411\u3002"}
          </p>
        </div>
      )}
    </div>
  );
}

function ConfirmSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <label className="min-w-0">
      <span className="mb-1 block text-[10px] font-bold text-slate-400">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none transition-colors focus:border-violet-300"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function readConfirmParams(params: Record<string, unknown>): GenerationParams {
  return {
    model: String(params.model || params.ai_model || "gpt-image-2") as LingyaModel,
    aspectRatio: String(params.aspectRatio || params.aspect_ratio || "3:4") as AspectRatio,
    imageSize: String(params.imageSize || params.image_size || "1K") as ImageSize,
    count: Math.min(Math.max(Number(params.count || params.gen_count || 1), 1), 4),
    prompt: typeof params.prompt === "string" ? params.prompt : "",
  };
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "刚刚";
  if (diffMins < 60) return `${diffMins} 分钟前`;
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  const time = d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  if (isToday) return time;
  if (d.toDateString() === yesterday.toDateString()) return `昨天 ${time}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}

function formatTimeShort(ts: string): string {
  return new Date(ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/**
 * 流式 Markdown 渲染器
 * 服务器只发送干净的 reply 文本（无 JSON），所以可以安全地实时渲染。
 * 流式中显示闪烁光标表示还在生成。
 */
function StreamingMarkdown({ content, done }: { content: string; done?: boolean }) {
  if (!content) return null;

  return (
    <>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      {!done && <span className="inline-block h-4 w-0.5 animate-pulse bg-violet-400 align-middle ml-0.5" />}
    </>
  );
}

function QuickAction({
  icon, label, onClick, variant = "default",
}: {
  icon: React.ReactNode; label: string; onClick: () => void; variant?: "default" | "primary";
}) {
  const base = "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all";
  const styles = variant === "primary"
    ? "bg-violet-600 text-white shadow-sm hover:bg-violet-700"
    : "border border-slate-200 bg-white text-slate-600 hover:border-violet-200 hover:text-violet-600";
  return (
    <button onClick={onClick} className={`${base} ${styles}`}>
      {icon} {label}
    </button>
  );
}
