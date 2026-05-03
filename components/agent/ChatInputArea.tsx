"use client";

import { useRef, useState, type KeyboardEvent, type ClipboardEvent } from "react";
import { Send, Paperclip, X, Loader2, Sparkles, Zap, ChevronDown } from "lucide-react";
import type { ChatImage, GenerationParams } from "@/lib/agent/types";
import type { LingyaModel, AspectRatio, ImageSize } from "@/lib/api/lingya";

type Props = {
  inputText: string;
  inputImages: ChatImage[];
  params: GenerationParams;
  isGenerating: boolean;
  estimatedCredits: number;
  onTextChange: (text: string) => void;
  onAddImages: (files: File[]) => void;
  onRemoveImage: (index: number) => void;
  onParamsChange: (params: Partial<GenerationParams>) => void;
  onSend: () => void;
  onAIWrite: () => void;
};

const MODEL_OPTIONS: Array<{ value: LingyaModel; label: string }> = [
  { value: "gpt-image-2", label: "GPT Image" },
  { value: "doubao-seedream-4-5-251128", label: "Seedream" },
  { value: "nano-banana-2", label: "Nano Banana" },
];

const RATIO_OPTIONS: Array<{ value: AspectRatio; label: string }> = [
  { value: "3:4", label: "3:4" },
  { value: "1:1", label: "1:1" },
  { value: "9:16", label: "9:16" },
  { value: "4:3", label: "4:3" },
  { value: "16:9", label: "16:9" },
];

const SIZE_OPTIONS: Array<{ value: ImageSize; label: string }> = [
  { value: "1K", label: "1K" },
  { value: "2K", label: "2K" },
  { value: "4K", label: "4K" },
];

const COUNT_OPTIONS = [1, 2, 3, 4];

export function ChatInputArea({
  inputText, inputImages, params, isGenerating, estimatedCredits,
  onTextChange, onAddImages, onRemoveImage, onParamsChange, onSend, onAIWrite,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files: File[] = [];
    for (const item of Array.from(e.clipboardData.items)) {
      if (item.type.startsWith("image/")) {
        const f = item.getAsFile();
        if (f) files.push(f);
      }
    }
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

  const handleTextareaInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  const uploading = inputImages.some((img) => img.uploading);

  return (
    <div
      className="border-t border-slate-200/80 bg-white/90 backdrop-blur-2xl"
      onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <div className="mx-auto max-w-3xl px-4 py-3 sm:px-6">
        {/* 已上传图片 */}
        {inputImages.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {inputImages.map((img, i) => (
              <div key={i} className="group relative">
                <div className="relative h-16 w-16 overflow-hidden rounded-xl border border-slate-200">
                  <img src={img.hostedUrl || img.url} alt={`图${img.index}`} className="h-full w-full object-cover" />
                  {img.uploading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                    </div>
                  )}
                </div>
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-violet-600 px-1.5 py-0.5 text-[9px] font-bold text-white shadow">
                  图{img.index}
                </span>
                <button
                  onClick={() => onRemoveImage(i)}
                  className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white opacity-0 shadow transition-opacity group-hover:opacity-100"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 拖拽提示 */}
        {isDragging && (
          <div className="mb-2 flex items-center justify-center rounded-xl border-2 border-dashed border-violet-300 bg-violet-50/50 py-6 text-sm font-bold text-violet-500">
            拖放图片到这里
          </div>
        )}

        {/* 输入行 */}
        <div className="flex items-end gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => { onAddImages(Array.from(e.target.files || [])); e.target.value = ""; }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition-colors hover:border-violet-300 hover:text-violet-500"
            title="上传图片"
          >
            <Paperclip className="h-4 w-4" />
          </button>

          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e) => { onTextChange(e.target.value); handleTextareaInput(); }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="描述你想做什么... 例如：帮我把图1的衣服穿到图2身上"
            rows={1}
            className="min-h-[40px] max-h-[120px] flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition-all placeholder:text-slate-300 focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
          />

          <button
            onClick={onSend}
            disabled={isGenerating || uploading || (!inputText.trim() && inputImages.length === 0)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 text-white shadow-lg shadow-violet-200 transition-opacity hover:opacity-90 disabled:opacity-30"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>

        {/* 参数栏 */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {/* 模型 */}
          <Select
            value={params.model}
            onChange={(v) => onParamsChange({ model: v as LingyaModel })}
            options={MODEL_OPTIONS}
          />
          {/* 比例 */}
          <Select
            value={params.aspectRatio}
            onChange={(v) => onParamsChange({ aspectRatio: v as AspectRatio })}
            options={RATIO_OPTIONS}
          />
          {/* 尺寸 */}
          <Select
            value={params.imageSize}
            onChange={(v) => onParamsChange({ imageSize: v as ImageSize })}
            options={SIZE_OPTIONS}
          />
          {/* 张数 */}
          <div className="flex items-center gap-1">
            {COUNT_OPTIONS.map((n) => (
              <button
                key={n}
                onClick={() => onParamsChange({ count: n })}
                className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold transition-all ${
                  params.count === n
                    ? "bg-violet-100 text-violet-700 ring-1 ring-violet-200"
                    : "text-slate-400 hover:bg-slate-100"
                }`}
              >
                {n}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {/* AI 帮写 */}
          <button
            onClick={onAIWrite}
            disabled={inputImages.length === 0 || uploading}
            className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-700 transition-all hover:bg-amber-100 disabled:opacity-40"
            title="根据已上传图片优化提示词"
          >
            <Sparkles className="h-3 w-3" />
            AI 帮写
          </button>

          {/* 立即生成 */}
          <button
            onClick={onSend}
            disabled={isGenerating || uploading || (!inputText.trim() && inputImages.length === 0)}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-violet-200 transition-opacity hover:opacity-90 disabled:opacity-30"
          >
            <Zap className="h-3.5 w-3.5" />
            立即生成
            <span className="opacity-70">({estimatedCredits}分)</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }> }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-lg border border-slate-200 bg-white py-1.5 pl-2.5 pr-7 text-xs font-medium text-slate-600 outline-none transition-colors hover:border-violet-300 focus:border-violet-300 focus:ring-1 focus:ring-violet-200"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
    </div>
  );
}
