"use client";

import { useRef, useState, useCallback, useEffect, type KeyboardEvent, type ClipboardEvent } from "react";
import { Paperclip, Sparkles, ArrowUp, Settings, X, Loader2, MessageCircle, Wand2 } from "lucide-react";
import type { ChatImage, GenerationParams, AgentMode, AgentIntentMode, ChatImageRole } from "@/lib/agent/types";
import type { LingyaModel, AspectRatio, ImageSize } from "@/lib/api/lingya";
import { getCreditCost } from "@/lib/api/lingya";
import { detectMentionTrigger, insertMention } from "@/lib/agent/mention-parser";
import { detectSlashTrigger, applyCommand, type SlashCommand } from "@/lib/agent/slash-commands";
import { ImageTray } from "./ImageTray";
import { MentionDropdown } from "./MentionDropdown";
import { SlashCommandDropdown } from "./SlashCommandDropdown";


type Props = {
  inputText: string;
  inputImages: ChatImage[];
  params: GenerationParams;
  mode?: AgentMode;
  intentMode: AgentIntentMode;
  isSending: boolean;
  isAIWriting: boolean;
  estimatedCredits: number;
  onTextChange: (text: string) => void;
  onAddImages: (files: File[]) => void;
  onRemoveImage: (index: number) => void;
  onClearImages?: () => void;
  onImageRoleChange?: (index: number, role: ChatImageRole) => void;
  onModeChange?: (mode: AgentMode) => void;
  onIntentModeChange: (mode: AgentIntentMode) => void;
  onParamsChange: (params: Partial<GenerationParams>) => void;
  onSend: () => void;
  onAIWrite: () => void;
  onPreview?: (url: string) => void;
};

const MODEL_OPTS = [
  { value: "gpt-image-2", label: "GPT Image", desc: "OpenAI" },
  { value: "nano-banana-2", label: "Nano Banana", desc: "轻量" },
  { value: "doubao-seedream-4-5-251128", label: "Seedream", desc: "字节" },
];
const RATIO_OPTS: Array<{ value: AspectRatio; label: string }> = [
  { value: "3:4", label: "3:4" }, { value: "1:1", label: "1:1" },
  { value: "9:16", label: "9:16" }, { value: "4:3", label: "4:3" },
  { value: "16:9", label: "16:9" },
];
const SIZE_OPTS: Array<{ value: ImageSize; label: string; desc: string }> = [
  { value: "1K", label: "1K", desc: "标准" },
  { value: "2K", label: "2K", desc: "高清" },
  { value: "4K", label: "4K", desc: "超清" },
];

function getCreditForCombo(model: LingyaModel, size: ImageSize, ratio: AspectRatio): number {
  try { return getCreditCost(model, size, ratio); } catch { return 4; }
}

const ROLE_HINTS: Record<string, string> = {
  auto: "自动",
  clothing: "服装",
  reference: "参考",
  face: "脸图",
  background: "背景",
  source: "原图",
};

export function InputComposer({
  inputText, inputImages, params, mode, intentMode, isSending, isAIWriting, estimatedCredits,
  onTextChange, onAddImages, onRemoveImage, onClearImages, onImageRoleChange, onModeChange, onIntentModeChange, onParamsChange, onSend, onAIWrite, onPreview,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [mentionState, setMentionState] = useState({ active: false, query: "" });
  const [slashState, setSlashState] = useState({ active: false, query: "" });
  const [cursorPos, setCursorPos] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    if (!settingsOpen) return;
    const close = () => setSettingsOpen(false);
    setTimeout(() => document.addEventListener("click", close), 0);
    return () => document.removeEventListener("click", close);
  }, [settingsOpen]);

  useEffect(() => {
    if (!isSending && !isAIWriting) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [isSending, isAIWriting]);

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    const pos = el.selectionStart ?? 0;
    setCursorPos(pos);
    setMentionState(detectMentionTrigger(el.value, pos));
    setSlashState(detectSlashTrigger(el.value, pos));
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!mentionState.active && !slashState.active && canSend) onSend();
    }
  };

  const handleMentionSelect = (imageIndex: number) => {
    if (imageIndex === -1) {
      setMentionState({ active: false, query: "" });
      textareaRef.current?.focus();
      return;
    }
    const el = textareaRef.current;
    if (!el) return;
    const result = insertMention(el.value, cursorPos, imageIndex);
    onTextChange(result.text);
    setMentionState({ active: false, query: "" });
    setTimeout(() => { el.focus(); el.setSelectionRange(result.cursorPos, result.cursorPos); }, 10);
  };

  const handleSlashSelect = (command: SlashCommand | null) => {
    setSlashState({ active: false, query: "" });
    if (!command) { textareaRef.current?.focus(); return; }

    // 特殊动作
    if (command.action === "clear") {
      onTextChange("");
      textareaRef.current?.focus();
      return;
    }
    if (command.action === "aiwrite") {
      onAIWrite();
      textareaRef.current?.focus();
      return;
    }

    // 模板命令：替换 /xxx 为模板文本
    const el = textareaRef.current;
    if (!el) return;
    const result = applyCommand(el.value, cursorPos, command);
    onTextChange(result.text);
    setTimeout(() => { el.focus(); el.setSelectionRange(result.cursorPos, result.cursorPos); }, 10);
  };

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.items)
      .filter((item) => item.type.startsWith("image/"))
      .map((item) => item.getAsFile()).filter(Boolean) as File[];
    if (files.length > 0) { e.preventDefault(); onAddImages(files); }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (files.length > 0) onAddImages(files);
  };

  const isUploadingImages = inputImages.some((image) => image.uploading);
  const hasUploadError = inputImages.some((image) => image.uploadError);
  const readyImages = inputImages.filter((image) => !image.uploading && !image.uploadError);
  const invalidImageRefs = getInvalidImageRefs(inputText, readyImages);
  const visibleInvalidImageRefs = !isUploadingImages && !hasUploadError ? invalidImageRefs : [];
  const canSend = !isSending && !isAIWriting && !isUploadingImages && !hasUploadError && invalidImageRefs.length === 0 && (inputText.trim().length > 0 || inputImages.length > 0);
  const modelLabel = MODEL_OPTS.find((o) => o.value === params.model)?.label || "模型";
  const currentCost = getCreditForCombo(params.model, params.imageSize, params.aspectRatio);
  const placeholder = inputImages.length > 0
    ? isUploadingImages
      ? "图片上传中，完成后就可以发送..."
      : hasUploadError && readyImages.length === 0
        ? "请先移除上传失败的图片，或重新上传..."
        : "说清楚目标，比如：把图1衣服穿到图2人物上，生成4张单图..."
    : "描述你想做什么... 输入 / 查看快捷指令";
  const sendTitle = isUploadingImages
    ? "图片上传完成后再发送"
    : hasUploadError
      ? "请先移除上传失败的图片"
    : invalidImageRefs.length > 0
      ? `请先处理无效引用：${invalidImageRefs.join("、")}`
    : canSend
      ? "发送"
      : inputImages.length > 0
        ? "补一句目标后发送"
        : "输入文字或上传图片后发送";
  const missingImageHint = !isUploadingImages && !hasUploadError
    ? getMissingComposerImageHint(inputText, readyImages.length)
    : "";

  return (
    <div
      className="border-t border-slate-100 bg-gradient-to-b from-white to-slate-50/80"
      onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <div className="mx-auto max-w-4xl px-4 pb-3 pt-2 sm:px-6">
        {isDragging && (
          <div className="mb-2 flex items-center justify-center rounded-xl border-2 border-dashed border-violet-300 bg-violet-50/50 py-5 text-sm font-bold text-violet-500">
            拖放图片到这里
          </div>
        )}
        {missingImageHint && (
          <MissingImageNotice
            hint={missingImageHint}
            onUpload={() => fileRef.current?.click()}
            onTextOnly={() => {
              const next = inputText.trim()
                ? `${inputText.trim()}\n不使用参考图，直接按文字生成。`
                : "不使用参考图，直接按文字生成。";
              onTextChange(next);
              setTimeout(() => {
                textareaRef.current?.focus();
                handleInput();
              }, 10);
            }}
          />
        )}
        {visibleInvalidImageRefs.length > 0 && (
          <InvalidMentionNotice
            refs={visibleInvalidImageRefs}
            onClean={() => {
              const next = removeInvalidImageRefs(inputText, visibleInvalidImageRefs);
              onTextChange(next);
              setTimeout(() => {
                textareaRef.current?.focus();
                handleInput();
              }, 10);
            }}
          />
        )}

        <ContextStatus
          imageCount={readyImages.length}
          uploadingCount={inputImages.filter((image) => image.uploading).length}
          failedCount={inputImages.filter((image) => image.uploadError).length}
          intentMode={intentMode}
        />

        <ImageTray
          images={inputImages}
          onAdd={onAddImages}
          onRemove={onRemoveImage}
          onClear={onClearImages}
          onRoleChange={onImageRoleChange}
          onPreview={onPreview}
        />

        {/* @ 引用标签（输入框上方） */}
        {readyImages.length > 0 && (
          <>
            <MentionChips text={inputText} images={readyImages} />
            <ComposerSmartHints
              text={inputText}
              images={readyImages}
              onApply={(nextText) => {
                onTextChange(nextText);
                setTimeout(() => {
                  textareaRef.current?.focus();
                  handleInput();
                }, 10);
              }}
            />
          </>
        )}

        {/* 输入容器 */}
        <div className="relative">
          <SlashCommandDropdown query={slashState.query} visible={slashState.active} onSelect={handleSlashSelect} />
          <MentionDropdown images={readyImages} query={mentionState.query} onSelect={handleMentionSelect} visible={mentionState.active} />

          <div className="flex items-center rounded-2xl border border-slate-200/80 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.04)] transition-all focus-within:border-violet-300/60 focus-within:shadow-[0_2px_20px_rgba(139,92,246,0.08)]">
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => { onAddImages(Array.from(e.target.files || [])); e.target.value = ""; }} />

            <button onClick={() => fileRef.current?.click()}
              className="flex h-11 w-11 shrink-0 items-center justify-center text-slate-300 transition-colors hover:text-violet-400"
              aria-label="上传图片" title="上传图片">
              <Paperclip className="h-[18px] w-[18px]" />
            </button>

            <textarea ref={textareaRef} value={inputText}
              onChange={(e) => { onTextChange(e.target.value); handleInput(); }}
              onKeyDown={handleKeyDown} onPaste={handlePaste} onClick={handleInput}
              placeholder={placeholder}
              aria-label="输入消息"
              rows={1}
              className="custom-scroll min-h-[44px] max-h-[120px] flex-1 resize-none py-3 pr-2 text-[14px] leading-[1.5] text-slate-800 outline-none placeholder:text-slate-300"
              style={{ height: "44px" }}
            />

            <div className="flex shrink-0 items-center gap-0.5 pr-1.5">
              {inputImages.length > 0 && (
                <button onClick={onAIWrite} disabled={isAIWriting}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition-all hover:bg-amber-50 hover:text-amber-500 disabled:opacity-40"
                  aria-label="AI 帮写" title="AI 帮写：根据图片优化提示词">
                  {isAIWriting ? <Loader2 className="h-4 w-4 animate-spin text-amber-400" /> : <Sparkles className="h-4 w-4" />}
                </button>
              )}
              <button onClick={onSend} disabled={!canSend}
                title={sendTitle}
                aria-label={sendTitle}
                className={`flex h-8 w-8 items-center justify-center rounded-xl transition-all ${
                  canSend ? "bg-slate-900 text-white hover:bg-slate-800" : "bg-slate-100 text-slate-300"
                }`}>
                <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>

        {/* 底部工具栏 */}
        <div className="mt-1.5 flex items-center gap-2 px-1">
          <AgentChatModeSwitch value={intentMode} onChange={onIntentModeChange} />

          <div className="relative">
            <button onClick={(e) => { e.stopPropagation(); setSettingsOpen(!settingsOpen); }}
              className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] transition-all ${
                settingsOpen ? "bg-violet-50 text-violet-600" : "text-slate-400 hover:text-slate-600"
              }`}>
              <Settings className="h-3 w-3" />
              <span>{modelLabel} · {params.aspectRatio} · {params.imageSize}</span>
            </button>

            {settingsOpen && (
              <SettingsPanel params={params} modelLabel={modelLabel} mode={mode}
                onParamsChange={onParamsChange} onClose={() => setSettingsOpen(false)} />
            )}
          </div>

          <div className="flex-1" />

          {mode === "agent" && (
            <span className="text-[11px] font-medium tabular-nums text-amber-500">
              {currentCost}×{params.count}={currentCost * params.count}积分
            </span>
          )}
        </div>

        <p className="mt-1 text-center text-[11px] text-slate-300">
          <span className="font-semibold text-violet-400">/</span> 快捷指令 ·
          <span className="font-semibold text-violet-400"> @</span> 绑定图片 ·
          <span className="font-semibold"> Enter</span> 发送 ·
          <span className="font-semibold"> Shift+Enter</span> 换行
        </p>
      </div>
    </div>
  );
}

function ContextStatus({
  imageCount,
  uploadingCount,
  failedCount,
  intentMode,
}: {
  imageCount: number;
  uploadingCount: number;
  failedCount: number;
  intentMode: AgentIntentMode;
}) {
  const chatOnly = intentMode === "chat";
  const contextLabel = imageCount > 0
    ? `当前上下文：${imageCount} 张可用附件图`
    : uploadingCount > 0
      ? "当前上下文：图片上传中"
      : failedCount > 0
        ? "当前上下文：有失败图片"
        : "当前上下文：无附件图";
  const contextDesc = failedCount > 0
    ? `${failedCount} 张图片上传失败，请移除后重新上传；失败图不会参与下一次判断。`
    : uploadingCount > 0
    ? `${uploadingCount} 张图片上传中，完成后再发送，避免后端看不到图。`
    : chatOnly
    ? "只对话和分析，不创建生成任务、不扣分。"
    : imageCount > 0
      ? "默认模式，会理解图片和文字，必要时拆成工作流；生成前确认。"
      : "默认模式，会理解需求，必要时规划或生成；生成前确认。";

  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/70 bg-white/70 px-3 py-2 text-[11px] shadow-sm backdrop-blur">
      <span className="font-bold text-slate-700">{contextLabel}</span>
      <span className={`rounded-full px-2 py-0.5 font-semibold ${
        chatOnly ? "bg-slate-100 text-slate-600" : "bg-violet-50 text-violet-600"
      }`}>
        {chatOnly ? "Chat" : "Agent"}
      </span>
      <span className="min-w-0 flex-1 truncate text-slate-400">{contextDesc}</span>
    </div>
  );
}

function AgentChatModeSwitch({
  value,
  onChange,
}: {
  value: AgentIntentMode;
  onChange: (mode: AgentIntentMode) => void;
}) {
  const chatOnly = value === "chat";
  return (
    <div
      className="inline-flex h-7 shrink-0 items-center rounded-full border border-slate-200 bg-white p-0.5 text-[11px] font-semibold shadow-[0_1px_8px_rgba(15,23,42,0.04)]"
      aria-label="选择对话模式"
    >
      <button
        type="button"
        onClick={() => onChange("smart")}
        className={`inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 transition-colors ${
          chatOnly ? "text-slate-500 hover:bg-slate-50 hover:text-slate-700" : "bg-slate-900 text-white"
        }`}
        title="Agent：默认模式，会理解需求、分析图片、规划工作流或生成"
      >
        <Wand2 className="h-3.5 w-3.5" />
        <span>Agent</span>
      </button>
      <button
        type="button"
        onClick={() => onChange("chat")}
        className={`inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 transition-colors ${
          chatOnly ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
        }`}
        title="Chat：只对话和分析，不创建生成任务"
      >
        <MessageCircle className="h-3.5 w-3.5" />
        <span>Chat</span>
      </button>
    </div>
  );
}

function MissingImageNotice({
  hint,
  onUpload,
  onTextOnly,
}: {
  hint: string;
  onUpload: () => void;
  onTextOnly: () => void;
}) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-[11px] text-amber-800">
      <span className="font-bold">可能缺少参考图</span>
      <span className="min-w-0 flex-1 leading-relaxed">{hint}</span>
      <button
        type="button"
        onClick={onUpload}
        className="rounded-lg bg-white px-2.5 py-1 font-bold text-amber-700 ring-1 ring-amber-100 transition-colors hover:bg-amber-100/70"
      >
        上传图片
      </button>
      <button
        type="button"
        onClick={onTextOnly}
        className="rounded-lg px-2.5 py-1 font-bold text-amber-700 transition-colors hover:bg-amber-100/70"
      >
        改为纯文字生成
      </button>
    </div>
  );
}

function InvalidMentionNotice({
  refs,
  onClean,
}: {
  refs: string[];
  onClean: () => void;
}) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-rose-200 bg-rose-50/80 px-3 py-2 text-[11px] text-rose-700">
      <span className="font-bold">图片引用失效</span>
      <span className="min-w-0 flex-1 leading-relaxed">
        {refs.join("、")} 当前不可用，可能已移除或尚未上传。请清理后再发送，避免 Agent 按错图理解。
      </span>
      <button
        type="button"
        onClick={onClean}
        className="rounded-lg bg-white px-2.5 py-1 font-bold text-rose-600 ring-1 ring-rose-100 transition-colors hover:bg-rose-100/70"
      >
        清理引用
      </button>
    </div>
  );
}

function SettingsPanel({
  params, modelLabel, mode, onParamsChange, onClose,
}: {
  params: GenerationParams; modelLabel: string; mode?: AgentMode;
  onParamsChange: (p: Partial<GenerationParams>) => void; onClose: () => void;
}) {
  return (
    <div onClick={(e) => e.stopPropagation()}
      className="absolute bottom-full left-0 mb-2 w-80 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-bold text-slate-800">生成设置</span>
        <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 模型 */}
      <div className="mb-3">
        <label className="mb-1.5 block text-xs font-bold text-slate-500">模型</label>
        <div className="grid grid-cols-3 gap-1.5">
          {MODEL_OPTS.map((o) => (
            <button key={o.value} onClick={() => onParamsChange({ model: o.value as LingyaModel })}
              className={`rounded-lg border px-2 py-2 text-center transition-all ${
                params.model === o.value ? "border-violet-300 bg-violet-50 text-violet-700 shadow-sm" : "border-slate-200 text-slate-600 hover:border-violet-200"
              }`}>
              <span className="block text-xs font-bold">{o.label}</span>
              <span className="block text-[10px] text-slate-400">{o.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 比例 */}
      <div className="mb-3">
        <label className="mb-1.5 block text-xs font-bold text-slate-500">比例</label>
        <div className="flex gap-1.5">
          {RATIO_OPTS.map((o) => (
            <button key={o.value} onClick={() => onParamsChange({ aspectRatio: o.value })}
              className={`flex-1 rounded-lg border py-1.5 text-center text-xs font-bold transition-all ${
                params.aspectRatio === o.value ? "border-violet-300 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-500 hover:border-violet-200"
              }`}>{o.label}</button>
          ))}
        </div>
      </div>

      {/* 尺寸 + 积分 */}
      <div className="mb-3">
        <label className="mb-1.5 block text-xs font-bold text-slate-500">分辨率</label>
        <div className="flex gap-1.5">
          {SIZE_OPTS.map((o) => {
            const cost = getCreditForCombo(params.model, o.value, params.aspectRatio);
            return (
              <button key={o.value} onClick={() => onParamsChange({ imageSize: o.value })}
                className={`flex-1 rounded-lg border py-2 text-center transition-all ${
                  params.imageSize === o.value ? "border-violet-300 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-500 hover:border-violet-200"
                }`}>
                <span className="block text-xs font-bold">{o.label}</span>
                <span className="block text-[10px] text-slate-400">{o.desc}</span>
                <span className="block text-[10px] font-bold text-amber-500">{cost}分</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 张数 — 暂时隐藏，后续支持批量时再开放
      <div>
        <label className="mb-1.5 block text-xs font-bold text-slate-500">张数</label>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4].map((n) => (
            <button key={n} onClick={() => onParamsChange({ count: n })}
              className={`flex-1 rounded-lg border py-2 text-center text-sm font-bold transition-all ${
                params.count === n ? "border-violet-300 bg-violet-50 text-violet-700" : "border-slate-200 text-slate-500 hover:border-violet-200"
              }`}>{n}</button>
          ))}
        </div>
      </div>
      */}

      {/* 总积分 */}
      {mode === "agent" && (
        <div className="mt-3 flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-xs">
          <span className="text-amber-600">预估消耗</span>
          <span className="font-bold text-amber-700">{getCreditForCombo(params.model, params.imageSize, params.aspectRatio) * params.count} 积分</span>
        </div>
      )}
    </div>
  );
}

/**
 * 解析输入文本中的 @图N 引用，显示为图片芯片
 * 像 Slack/Teams 的 @ mention 一样，显示在输入框上方
 */
function MentionChips({ text, images }: { text: string; images: ChatImage[] }) {
  const mentions = text.match(/@图\d+/g);
  if (!mentions) return null;

  const unique = [...new Set(mentions)];
  const chips = unique
    .map((m) => {
      const idx = parseInt(m.replace("@图", ""));
      const img = images.find((i) => i.index === idx);
      if (!img) return null;
      return { label: m, image: img };
    })
    .filter(Boolean) as Array<{ label: string; image: ChatImage }>;

  if (chips.length === 0) return null;

  return (
    <div className="mb-1.5 flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <div
          key={chip.label}
          className="flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2 py-1"
        >
          <div className="studio-checkerboard h-5 w-5 overflow-hidden rounded border border-violet-200">
            <img src={chip.image.hostedUrl || chip.image.url} alt={chip.label} className="h-full w-full object-contain" />
          </div>
          <span className="text-[11px] font-bold text-violet-700">{chip.label}</span>
          <span className="rounded bg-white/70 px-1 text-[10px] font-semibold text-violet-400">
            {ROLE_HINTS[chip.image.role || "auto"] || "自动"}
          </span>
        </div>
      ))}
      <span className="flex items-center text-[10px] text-slate-300">← 引用图片</span>
    </div>
  );
}

function ComposerSmartHints({
  text,
  images,
  onApply,
}: {
  text: string;
  images: ChatImage[];
  onApply: (text: string) => void;
}) {
  if (images.length === 0) return null;
  const normalizedText = text.trim();
  const mentions = normalizedText.match(/@图\d+/g) || [];
  const hasClearImageRelation = mentions.length > 0 || /图\s*\d/.test(normalizedText);
  const suggestions = getComposerSmartSuggestions(images, normalizedText);

  return (
    <div className="mb-1.5 rounded-xl border border-slate-200/70 bg-white/75 px-2.5 py-2 shadow-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-bold text-slate-400">
          {hasClearImageRelation ? "已识别图片引用" : "建议先说明图片关系"}
        </span>
        {!hasClearImageRelation && images.length > 1 && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600">
            可用 @图1、@图2 避免误判
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-[10px] text-slate-400">
          {getComposerImageRoleSummary(images)}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {suggestions.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => onApply(mergeComposerSuggestion(normalizedText, item.text))}
            className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function getComposerSmartSuggestions(images: ChatImage[], text: string) {
  const first = images[0]?.index || 1;
  const relation = inferComposerImageRelation(images);
  const hasTwoImages = images.length >= 2;
  const base = [
    {
      label: hasTwoImages ? "换装 / 合成" : "图生图优化",
      text: hasTwoImages
        ? `帮我把 @图${relation.clothingIndex} 的衣服穿到 @图${relation.personIndex} 的人物身上，保持人物身份、服装结构、比例和材质准确。`
        : `基于 @图${first} 重新生成一张商业质感更好的图片，保持主体身份和关键结构不变。`,
    },
    {
      label: "姿势裂变",
      text: `基于 @图${first} 做姿势裂变，生成4张不同姿势的独立图片，不要四宫格，保持人物身份、服装结构和身体比例稳定。`,
    },
    {
      label: "电商详情页",
      text: `根据这些图片生成适合淘宝、PDD、抖音、小红书等平台的详情页素材，自动分析所需板块，确认前让我编辑平台、数量、画幅和输出要求。`,
    },
  ];

  if (/详情|淘宝|天猫|pdd|拼多多|抖音|小红书/i.test(text)) {
    return [
      {
        label: "补充平台要求",
        text: "输出适合移动端浏览的详情页素材，可按平台风格调整为淘宝/天猫/PDD/抖音/小红书；先拆分板块并让我确认。",
      },
      ...base.slice(0, 2),
    ];
  }

  return base;
}

function inferComposerImageRelation(images: ChatImage[]) {
  const clothing =
    images.find((image) => image.role === "clothing") ||
    images.find((image) => image.role === "source") ||
    images[0];
  const person =
    images.find((image) => image.role === "face" || image.role === "reference") ||
    images.find((image) => image.index !== clothing?.index) ||
    images[1] ||
    images[0];

  return {
    clothingIndex: clothing?.index || images[0]?.index || 1,
    personIndex: person?.index || images[1]?.index || images[0]?.index || 1,
  };
}

function getMissingComposerImageHint(text: string, imageCount: number) {
  if (imageCount > 0) return "";
  const normalized = text.trim();
  if (!normalized) return "";
  if (/不使用参考图|纯文字|文生图|直接按文字|无需图片|不需要图片/.test(normalized)) return "";
  const asksForExistingImage =
    /@?图\s*\d/.test(normalized) ||
    /这[张些]?图|这些图片|上传的图|附件图|原图|参考图|服装图|模特图|商品图|图片关系/.test(normalized) ||
    /(根据|基于|参考|分析|识别|换装|穿到|套到|还原|保持).{0,12}(图片|图|照片|素材)/.test(normalized);
  if (!asksForExistingImage) return "";
  return "你的描述像是在引用已有图片，但当前输入区没有附件。现在发送会先追问，不会直接生成或扣积分。";
}

function getInvalidImageRefs(text: string, images: ChatImage[]) {
  const available = new Set(images.map((image) => image.index));
  const refs = new Set<string>();
  for (const match of text.matchAll(/@?图(\d+)/g)) {
    const index = Number(match[1]);
    if (!available.has(index)) refs.add(`图${index}`);
  }
  return Array.from(refs);
}

function removeInvalidImageRefs(text: string, refs: string[]) {
  let next = text;
  for (const ref of refs) {
    const escaped = ref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    next = next.replace(new RegExp(`@?${escaped}\\s*`, "g"), "");
  }
  return next.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trimStart();
}

function mergeComposerSuggestion(current: string, suggestion: string) {
  if (!current) return suggestion;
  if (current.includes(suggestion)) return current;
  return `${current}\n${suggestion}`;
}

function getComposerImageRoleSummary(images: ChatImage[]) {
  return images
    .slice(0, 6)
    .map((img) => `图${img.index}:${ROLE_HINTS[img.role || "auto"] || "自动"}`)
    .join(" · ");
}
