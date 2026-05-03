"use client";

import { useRef, useState, useCallback, type KeyboardEvent, type ClipboardEvent } from "react";
import { Paperclip, Sparkles, Zap, ChevronDown } from "lucide-react";
import type { ChatImage, GenerationParams, AgentMode } from "@/lib/agent/types";
import type { LingyaModel, AspectRatio, ImageSize } from "@/lib/api/lingya";
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
  estimatedCredits: number;
  onTextChange: (text: string) => void;
  onAddImages: (files: File[]) => void;
  onRemoveImage: (index: number) => void;
  onModeChange: (mode: AgentMode) => void;
  onParamsChange: (params: Partial<GenerationParams>) => void;
  onSend: () => void;
  onAIWrite: () => void;
};

const MODEL_OPTS = [
  { value: "gpt-image-2", label: "GPT Image" },
  { value: "doubao-seedream-4-5-251128", label: "Seedream" },
  { value: "nano-banana-2", label: "Nano Banana" },
];
const RATIO_OPTS = [
  { value: "3:4", label: "3:4" }, { value: "1:1", label: "1:1" },
  { value: "9:16", label: "9:16" }, { value: "4:3", label: "4:3" },
];
const SIZE_OPTS = [{ value: "1K", label: "1K" }, { value: "2K", label: "2K" }, { value: "4K", label: "4K" }];

export function InputComposer({
  inputText, inputImages, params, mode, isSending, estimatedCredits,
  onTextChange, onAddImages, onRemoveImage, onModeChange, onParamsChange, onSend, onAIWrite,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [mentionState, setMentionState] = useState({ active: false, query: "" });
  const [cursorPos, setCursorPos] = useState(0);

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 100)}px`;
    const pos = el.selectionStart ?? 0;
    setCursorPos(pos);
    setMentionState(detectMentionTrigger(el.value, pos));
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (mentionState.active) return; // 让 mention dropdown 处理
      onSend();
    }
  };

  const handleMentionSelect = (imageIndex: number) => {
    const el = textareaRef.current;
    if (!el) return;
    const result = insertMention(el.value, cursorPos, imageIndex);
    onTextChange(result.text);
    setMentionState({ active: false, query: "" });
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(result.cursorPos, result.cursorPos);
    }, 10);
  };

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.items)
      .filter((item) => item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter(Boolean) as File[];
    if (files.length > 0) {
      e.preventDefault();
      onAddImages(files);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (files.length > 0) onAddImages(files);
  };

  return (
    <div
      className="border-t border-slate-200/80 bg-white/95 backdrop-blur-xl"
      onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <div className="mx-auto max-w-3xl px-4 py-3 sm:px-6">
        {/* 拖拽提示 */}
        {isDragging && (
          <div className="mb-2 flex items-center justify-center rounded-xl border-2 border-dashed border-violet-300 bg-violet-50/50 py-5 text-sm font-bold text-violet-500">
            拖放图片到这里
          </div>
        )}

        {/* 图片托盘 */}
        <ImageTray images={inputImages} onAdd={onAddImages} onRemove={onRemoveImage} />

        {/* 输入区 */}
        <div className="relative">
          <MentionDropdown
            images={inputImages}
            query={mentionState.query}
            onSelect={handleMentionSelect}
            visible={mentionState.active}
          />

          <div className="flex items-end gap-2">
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => { onAddImages(Array.from(e.target.files || [])); e.target.value = ""; }} />

            <button onClick={() => fileRef.current?.click()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition-colors hover:border-violet-300 hover:text-violet-500"
              title="上传图片">
              <Paperclip className="h-4 w-4" />
            </button>

            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => { onTextChange(e.target.value); handleInput(); }}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onClick={handleInput}
              placeholder={inputImages.length > 0
                ? `输入指令，用 @图N 引用图片...`
                : "上传图片后输入指令，用 @ 绑定图片..."
              }
              rows={1}
              className="min-h-[40px] max-h-[100px] flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition-all placeholder:text-slate-300 focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
            />
          </div>
        </div>

        {/* 参数栏 */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <ModeToggle mode={mode} onChange={onModeChange} />

          <div className="mx-1 h-4 w-px bg-slate-200" />

          <Select value={params.model} onChange={(v) => onParamsChange({ model: v as LingyaModel })} options={MODEL_OPTS} />
          <Select value={params.aspectRatio} onChange={(v) => onParamsChange({ aspectRatio: v as AspectRatio })} options={RATIO_OPTS} />
          <Select value={params.imageSize} onChange={(v) => onParamsChange({ imageSize: v as ImageSize })} options={SIZE_OPTS} />

          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4].map((n) => (
              <button key={n} onClick={() => onParamsChange({ count: n })}
                className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold transition-all ${
                  params.count === n ? "bg-violet-100 text-violet-700 ring-1 ring-violet-200" : "text-slate-400 hover:bg-slate-100"
                }`}>{n}</button>
            ))}
          </div>

          <div className="flex-1" />

          <button onClick={onAIWrite} disabled={inputImages.length === 0}
            className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-700 transition-all hover:bg-amber-100 disabled:opacity-40">
            <Sparkles className="h-3 w-3" /> AI 帮写
          </button>

          <button onClick={onSend}
            disabled={isSending || (!inputText.trim() && inputImages.length === 0)}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-violet-200 transition-opacity hover:opacity-90 disabled:opacity-30">
            <Zap className="h-3.5 w-3.5" /> 发送
            {mode === "agent" && <span className="opacity-70">({estimatedCredits}分)</span>}
          </button>
        </div>

        <p className="mt-1.5 text-[11px] text-slate-300">
          Enter 发送 · Shift+Enter 换行 · 输入 @ 绑定图片
        </p>
      </div>
    </div>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <div className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-lg border border-slate-200 bg-white py-1.5 pl-2.5 pr-7 text-xs font-medium text-slate-600 outline-none transition-colors hover:border-violet-300 focus:border-violet-300 focus:ring-1 focus:ring-violet-200">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
    </div>
  );
}
