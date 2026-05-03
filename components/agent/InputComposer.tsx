"use client";

import { useRef, useState, useCallback, useEffect, type KeyboardEvent, type ClipboardEvent } from "react";
import { Paperclip, Sparkles, Zap, Settings, ChevronDown, X } from "lucide-react";
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
  isAIWriting: boolean;
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
  { value: "gpt-image-2", label: "GPT Image", desc: "OpenAI 图像模型" },
  { value: "doubao-seedream-4-5-251128", label: "Seedream", desc: "字节跳动图像模型" },
  { value: "nano-banana-2", label: "Nano Banana", desc: "轻量图像模型" },
];
const RATIO_OPTS = [
  { value: "3:4", label: "3:4", desc: "竖版" },
  { value: "1:1", label: "1:1", desc: "正方形" },
  { value: "9:16", label: "9:16", desc: "长竖版" },
  { value: "4:3", label: "4:3", desc: "横版" },
  { value: "16:9", label: "16:9", desc: "宽屏" },
];
const SIZE_OPTS = [
  { value: "1K", label: "1K", desc: "标准" },
  { value: "2K", label: "2K", desc: "高清" },
  { value: "4K", label: "4K", desc: "超高清" },
];

export function InputComposer({
  inputText, inputImages, params, mode, isSending, isAIWriting, estimatedCredits,
  onTextChange, onAddImages, onRemoveImage, onModeChange, onParamsChange, onSend, onAIWrite,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [mentionState, setMentionState] = useState({ active: false, query: "" });
  const [cursorPos, setCursorPos] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // 点击外部关闭设置面板
  useEffect(() => {
    if (!settingsOpen) return;
    const close = () => setSettingsOpen(false);
    setTimeout(() => document.addEventListener("click", close), 0);
    return () => document.removeEventListener("click", close);
  }, [settingsOpen]);

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
      if (mentionState.active) return;
      onSend();
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
      .map((item) => item.getAsFile())
      .filter(Boolean) as File[];
    if (files.length > 0) { e.preventDefault(); onAddImages(files); }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (files.length > 0) onAddImages(files);
  };

  const modelLabel = MODEL_OPTS.find((o) => o.value === params.model)?.label || "模型";

  return (
    <div
      className="border-t border-slate-200/80 bg-white/95 backdrop-blur-xl"
      onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <div className="mx-auto max-w-3xl px-4 py-3 sm:px-6">
        {isDragging && (
          <div className="mb-2 flex items-center justify-center rounded-xl border-2 border-dashed border-violet-300 bg-violet-50/50 py-5 text-sm font-bold text-violet-500">
            拖放图片到这里
          </div>
        )}

        <ImageTray images={inputImages} onAdd={onAddImages} onRemove={onRemoveImage} />

        {/* 输入行 */}
        <div className="relative">
          <MentionDropdown images={inputImages} query={mentionState.query} onSelect={handleMentionSelect} visible={mentionState.active} />

          <div className="flex items-end gap-2">
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => { onAddImages(Array.from(e.target.files || [])); e.target.value = ""; }} />
            <button onClick={() => fileRef.current?.click()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition-colors hover:border-violet-300 hover:text-violet-500"
              title="上传图片">
              <Paperclip className="h-4 w-4" />
            </button>

            <textarea ref={textareaRef} value={inputText}
              onChange={(e) => { onTextChange(e.target.value); handleInput(); }}
              onKeyDown={handleKeyDown} onPaste={handlePaste} onClick={handleInput}
              placeholder={inputImages.length > 0 ? "输入指令，用 @图N 引用图片..." : "上传图片后输入指令，用 @ 绑定图片..."}
              rows={1}
              className="min-h-[40px] max-h-[100px] flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition-all placeholder:text-slate-300 focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
            />

            {/* 设置按钮 */}
            <div className="relative">
              <button onClick={(e) => { e.stopPropagation(); setSettingsOpen(!settingsOpen); }}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-slate-400 transition-all ${
                  settingsOpen ? "border-violet-300 bg-violet-50 text-violet-500" : "border-slate-200 hover:border-violet-300 hover:text-violet-500"
                }`} title="生成设置">
                <Settings className="h-4 w-4" />
              </button>

              {/* 设置弹框 */}
              {settingsOpen && (
                <div onClick={(e) => e.stopPropagation()}
                  className="absolute bottom-full right-0 mb-2 w-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-800">生成设置</span>
                    <button onClick={() => setSettingsOpen(false)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100">
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
                            params.model === o.value
                              ? "border-violet-300 bg-violet-50 text-violet-700 shadow-sm"
                              : "border-slate-200 text-slate-600 hover:border-violet-200"
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
                        <button key={o.value} onClick={() => onParamsChange({ aspectRatio: o.value as AspectRatio })}
                          className={`flex-1 rounded-lg border px-1.5 py-1.5 text-center transition-all ${
                            params.aspectRatio === o.value
                              ? "border-violet-300 bg-violet-50 text-violet-700"
                              : "border-slate-200 text-slate-500 hover:border-violet-200"
                          }`}>
                          <span className="block text-xs font-bold">{o.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 尺寸 */}
                  <div className="mb-3">
                    <label className="mb-1.5 block text-xs font-bold text-slate-500">尺寸</label>
                    <div className="flex gap-1.5">
                      {SIZE_OPTS.map((o) => (
                        <button key={o.value} onClick={() => onParamsChange({ imageSize: o.value as ImageSize })}
                          className={`flex-1 rounded-lg border px-2 py-1.5 text-center transition-all ${
                            params.imageSize === o.value
                              ? "border-violet-300 bg-violet-50 text-violet-700"
                              : "border-slate-200 text-slate-500 hover:border-violet-200"
                          }`}>
                          <span className="block text-xs font-bold">{o.label}</span>
                          <span className="block text-[10px] text-slate-400">{o.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 张数 */}
                  <div>
                    <label className="mb-1.5 block text-xs font-bold text-slate-500">生成张数</label>
                    <div className="flex gap-1.5">
                      {[1, 2, 3, 4].map((n) => (
                        <button key={n} onClick={() => onParamsChange({ count: n })}
                          className={`flex-1 rounded-lg border py-2 text-center text-sm font-bold transition-all ${
                            params.count === n
                              ? "border-violet-300 bg-violet-50 text-violet-700"
                              : "border-slate-200 text-slate-500 hover:border-violet-200"
                          }`}>{n}</button>
                      ))}
                    </div>
                  </div>

                  {/* 当前配置摘要 */}
                  <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-400">
                    {modelLabel} · {params.aspectRatio} · {params.imageSize} · {params.count}张
                    {mode === "agent" && <span className="ml-1 font-bold text-amber-600">· {estimatedCredits}积分</span>}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 底部操作栏 */}
        <div className="mt-2 flex items-center gap-2">
          <ModeToggle mode={mode} onChange={onModeChange} />

          {/* 配置摘要标签 */}
          <button onClick={(e) => { e.stopPropagation(); setSettingsOpen(true); }}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-400 transition-colors hover:border-violet-200 hover:text-violet-500">
            {modelLabel} · {params.aspectRatio} · {params.imageSize} · {params.count}张
          </button>

          <div className="flex-1" />

          <button onClick={onAIWrite} disabled={inputImages.length === 0 || isAIWriting}
            className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-700 transition-all hover:bg-amber-100 disabled:opacity-40">
            <Sparkles className={`h-3 w-3 ${isAIWriting ? "animate-spin" : ""}`} />
            {isAIWriting ? "分析中..." : "AI 帮写"}
          </button>

          <button onClick={onSend}
            disabled={isSending || isAIWriting || (!inputText.trim() && inputImages.length === 0)}
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
