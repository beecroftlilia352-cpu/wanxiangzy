"use client";

import { useRef, useState, useCallback, useEffect, type KeyboardEvent, type ClipboardEvent } from "react";
import { Paperclip, Sparkles, ArrowUp, Settings, X, Loader2 } from "lucide-react";
import type { ChatImage, GenerationParams, AgentMode } from "@/lib/agent/types";
import type { LingyaModel, AspectRatio, ImageSize } from "@/lib/api/lingya";
import { getCreditCost } from "@/lib/api/lingya";
import { detectMentionTrigger, insertMention } from "@/lib/agent/mention-parser";
import { ImageTray } from "./ImageTray";
import { MentionDropdown } from "./MentionDropdown";
import { ModeToggle } from "./ModeToggle";

type Props = {
  inputText: string;
  inputImages: ChatImage[];
  params: GenerationParams;
  mode: AgentMode;
  isSending: boolean;
  isAIWriting: boolean;
  estimatedCredits: number;
  onTextChange: (text: string) => void;
  onAddImages: (files: File[]) => void;
  onRemoveImage: (index: number) => void;
  onModeChange: (mode: AgentMode) => void;
  onParamsChange: (params: Partial<GenerationParams>) => void;
  onSend: () => void;
  onAIWrite: () => void;
  onPreview?: (url: string) => void;
};

const MODEL_OPTS = [
  { value: "gpt-image-2", label: "GPT Image", desc: "OpenAI" },
  { value: "doubao-seedream-4-5-251128", label: "Seedream", desc: "字节" },
  { value: "nano-banana-2", label: "Nano Banana", desc: "轻量" },
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

export function InputComposer({
  inputText, inputImages, params, mode, isSending, isAIWriting, estimatedCredits,
  onTextChange, onAddImages, onRemoveImage, onModeChange, onParamsChange, onSend, onAIWrite, onPreview,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [mentionState, setMentionState] = useState({ active: false, query: "" });
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
    setCursorPos(el.selectionStart ?? 0);
    setMentionState(detectMentionTrigger(el.value, el.selectionStart ?? 0));
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!mentionState.active) onSend();
    }
  };

  const handleMentionSelect = (imageIndex: number) => {
    const el = textareaRef.current;
    if (!el) return;
    const result = insertMention(el.value, cursorPos, imageIndex);
    onTextChange(result.text);
    setMentionState({ active: false, query: "" });
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

  const canSend = !isSending && !isAIWriting && (inputText.trim().length > 0 || inputImages.length > 0);
  const modelLabel = MODEL_OPTS.find((o) => o.value === params.model)?.label || "模型";
  const currentCost = getCreditForCombo(params.model, params.imageSize, params.aspectRatio);

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

        <ImageTray images={inputImages} onAdd={onAddImages} onRemove={onRemoveImage} onPreview={onPreview} />

        {/* 输入容器 */}
        <div className="relative">
          <MentionDropdown images={inputImages} query={mentionState.query} onSelect={handleMentionSelect} visible={mentionState.active} />

          <div className="flex items-center rounded-2xl border border-slate-200/80 bg-white shadow-[0_2px_12px_rgba(0,0,0,0.04)] transition-all focus-within:border-violet-300/60 focus-within:shadow-[0_2px_20px_rgba(139,92,246,0.08)]">
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => { onAddImages(Array.from(e.target.files || [])); e.target.value = ""; }} />

            <button onClick={() => fileRef.current?.click()}
              className="flex h-11 w-11 shrink-0 items-center justify-center text-slate-300 transition-colors hover:text-violet-400"
              title="上传图片">
              <Paperclip className="h-[18px] w-[18px]" />
            </button>

            <div className="relative min-h-[44px] flex-1">
              {inputText.includes("@") && inputImages.length > 0 && (
                <div aria-hidden="true"
                  className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words py-3 pr-1 text-[14px] leading-[1.5]"
                  style={{ font: "inherit" }}>
                  {renderHighlightSegments(inputText)}
                </div>
              )}
              <textarea ref={textareaRef} value={inputText}
                onChange={(e) => { onTextChange(e.target.value); handleInput(); }}
                onKeyDown={handleKeyDown} onPaste={handlePaste} onClick={handleInput}
                placeholder="描述你想做什么..."
                rows={1}
                className={`block min-h-[44px] max-h-[120px] w-full resize-none py-3 pr-1 text-[14px] leading-[1.5] outline-none placeholder:text-slate-300 ${
                  inputText.includes("@") && inputImages.length > 0 ? "text-transparent caret-violet-600" : "text-slate-800"
                }`}
              />
            </div>

            <div className="flex shrink-0 items-center gap-0.5 pr-1.5">
              {inputImages.length > 0 && (
                <button onClick={onAIWrite} disabled={isAIWriting}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition-all hover:bg-amber-50 hover:text-amber-500 disabled:opacity-40"
                  title="AI 帮写：根据图片优化提示词">
                  {isAIWriting ? <Loader2 className="h-4 w-4 animate-spin text-amber-400" /> : <Sparkles className="h-4 w-4" />}
                </button>
              )}
              <button onClick={onSend} disabled={!canSend}
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
          <ModeToggle mode={mode} onChange={onModeChange} />
          <div className="h-3 w-px bg-slate-200" />

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
      </div>
    </div>
  );
}

function SettingsPanel({
  params, modelLabel, mode, onParamsChange, onClose,
}: {
  params: GenerationParams; modelLabel: string; mode: AgentMode;
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

      {/* 张数 */}
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

function renderHighlightSegments(text: string) {
  const parts = text.split(/(@图\d+)/g);
  return parts.map((part, i) => {
    if (/^@图\d+$/.test(part)) {
      return <span key={i} className="rounded bg-violet-100 px-0.5 font-bold text-violet-700">{part}</span>;
    }
    return <span key={i}>{part}</span>;
  });
}
