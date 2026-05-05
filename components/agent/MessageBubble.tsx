"use client";

import { motion } from "framer-motion";
import { Bot, User, Loader2, CheckCircle2, AlertCircle, Download, ZoomIn, RefreshCw, Copy, Sparkles, ChevronDown } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AspectRatio, ImageSize, LingyaModel } from "@/lib/api/lingya";
import type { ChatImage, ChatImageRole, GenerationParams, Message } from "@/lib/agent/types";
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
  onRepair?: (messageId: string, repairValue: string) => void;
  onUpdateConfirmParams?: (messageId: string, params: Partial<GenerationParams>) => void;
  onUpdateConfirmImageRole?: (messageId: string, imageIndex: number, role: ChatImageRole) => void;
  onUseAsReference?: (url: string) => void;
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

export function MessageBubble({ message, prevMessage, sessionImages, onOpenImage, onRetry, onConfirm, onRepair, onUpdateConfirmParams, onUpdateConfirmImageRole, onUseAsReference }: Props) {
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
  if (!isUser && !content && !generation) return null;

  // 消息分组：同角色连续消息隐藏头像
  const isGrouped = prevMessage && prevMessage.role === role;
  const confirmImages = prevMessage?.role === "user" && prevMessage.images?.length
    ? prevMessage.images
    : sessionImages;

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
              </div>
            )}
          </div>
        )}

        {/* ===== 确认生成卡片（等待用户确认） ===== */}
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

function getGenerationRepairKind(module: string): RepairKind {
  if (module === "grass") return "grass";
  if (module === "pose") return "pose";
  if (module === "model") return "model";
  if (module === "garment_3d") return "garment3d";
  if (module === "model_background") return "modelBackground";
  if (module === "tryon") return "tryon";
  return "general";
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
